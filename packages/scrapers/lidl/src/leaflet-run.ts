import { mkdir, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { type Database, GeminiError, type Usage, askGemini, emptyUsage, pacificDay, recordFailure, recordSuccess, siteOffers } from "@bestprice/core";
import { FLYER_API, LEAFLET_PROMPT, cropRegion, LEAFLET_SCHEMA, OVERVIEW, type Flyer, isFatalGeminiStatus, modelPool, parseFlyer, parsePages, pickFlyerIdentifiers, toLeafletOffers } from "./leaflet";

// Буклет Lidl → Gemini читает страницы-картинки → grocery.leaflet_offers. Запуск раз в неделю (leaflet.yml).
// Флаги: --dry (ничего не писать в таблицу акций, только показать), --pages=1,3-5 (только эти страницы каждого буклета),
// --flyers=1 (только первый, то есть текущий, буклет), --force (перечитать и уже прочитанные страницы).
const SLUG = "lidl";
const DRY = process.argv.includes("--dry");
// Страница с хотя бы одной строкой в таблице считается прочитанной и пропускается. После правки парсера её надо перечитать: --force.
const FORCE = process.argv.includes("--force");
const pages = parsePages(process.argv.find((a) => a.startsWith("--pages="))?.slice(8));
const USER_AGENT = "BestPriceBot (personal project)";
const model = process.env.GEMINI_MODEL ?? "gemini-3.5-flash"; // самая точная в замере (12 из 12), но ≈60 с на страницу: ничего, раз в неделю
// Запасные модели (через запятую): читают страницы, пока основная перегружена (503) или исчерпала квоту (429). Выбраны замером на
// страницах 1 и 40 (docs/PLAN.md, «Буклеты магазинов»).
const fallbacks = (process.env.GEMINI_FALLBACK_MODELS ?? "gemini-3.5-flash-lite,gemini-3.1-flash-lite").split(",").map((s) => s.trim()).filter(Boolean);
const COOLDOWN_MS = 5 * 60_000; // сколько основная отдыхает после сбоя, прежде чем её снова попробуют
const pool = modelPool([model, ...fallbacks], COOLDOWN_MS);
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("Нет GEMINI_API_KEY");
// Бесплатный лимит: 15 запросов в минуту и 500 в сутки (docs/PLAN.md). Пауза между запросами держит минутный, потолок — суточный.
const maxEnv = Number(process.env.GEMINI_MAX_REQUESTS);
const maxRequests = Number.isFinite(maxEnv) && maxEnv > 0 ? maxEnv : 60;
const PAUSE_MS = 4500;

const sb = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const grocery = sb.schema("grocery");
const { data: source, error: sourceError } = await sb.from("sources").select("id").eq("slug", SLUG).single();
if (sourceError) throw sourceError;

const get = async (url: string) => {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Lidl: HTTP ${res.status} ${url.slice(0, 80)}`);
  return res;
};

const startedAt = new Date().toISOString();
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Riga" }).format(new Date());
const flyers: { identifier: string; flyer: Flyer }[] = [];
let failed = 0;
for (const identifier of pickFlyerIdentifiers(await (await get(OVERVIEW)).text())) {
  // Сбой метаданных одного буклета (например, будущего) не должен блокировать чтение другого: пропускаем его, запуск при этом считается сбойным.
  try {
    const flyer = parseFlyer(await (await get(FLYER_API + identifier)).json());
    if (flyer.endsAt >= today) flyers.push({ identifier, flyer }); // прошедшие недели не читаем
  } catch (e) {
    failed++;
    console.error(`Буклет ${identifier}: пропущен: ${e instanceof Error ? e.message : e}`);
  }
}
if (flyers.length === 0) throw new Error("Lidl: на странице обзора нет действующих продуктовых буклетов, вёрстка могла измениться");
flyers.sort((a, b) => a.flyer.startsAt.localeCompare(b.flyer.startsAt)); // сначала текущий: при потолке запросов недочитанным остаётся будущий
flyers.splice(Number(process.argv.find((a) => a.startsWith("--flyers="))?.slice(9)) || flyers.length);

// Расход квоты по моделям: у каждой свой лимит, в админке (/grocery/admin/ai) видна каждая.
const usages = new Map<string, Usage>();
const usageOf = (m: string) => usages.get(m) ?? usages.set(m, emptyUsage()).get(m)!;
let lastError: Error | null = null;
let requests = 0;
let saved = 0;
let stop = false;
let streak = 0; // сбоев подряд
let lastRequestAt = 0;
const invalidAll: string[] = [];

for (const { identifier, flyer } of flyers) {
  console.log(`\nБуклет «${flyer.name}» ${flyer.startsAt} — ${flyer.endsAt}, страниц ${flyer.pages.length}`);
  // Уже прочитанные страницы пропускаем: повторный запуск после сбоя не тратит квоту заново.
  const done = new Set<number>();
  if (!DRY && !FORCE) {
    const { data, error } = await grocery.from("leaflet_offers").select("page").eq("source_id", source.id).eq("flyer_id", flyer.id).limit(1000);
    if (error) throw error;
    for (const r of data) done.add(r.page);
  }
  for (const page of flyer.pages) {
    if (stop) break;
    if ((pages && !pages.includes(page.number)) || (!DRY && done.has(page.number))) continue;
    if (requests >= maxRequests) {
      console.warn(`Потолок запросов ${maxRequests} (GEMINI_MAX_REQUESTS) достигнут, остальные страницы в следующий запуск`);
      failed++;
      stop = true;
      break;
    }
    const wait = lastRequestAt + PAUSE_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
    requests++;
    try {
      const image = Buffer.from(await (await get(page.image)).arrayBuffer()).toString("base64");
      // Основная модель перегружена (503, 2026-10-31) или исчерпала квоту (429): страницу читает следующая по списку, основная после
      // перерыва сама пробуется на очередной странице (modelPool). Повторов внутри askGemini нет (attempts: 1): их роль у запасной модели.
      let r!: Awaited<ReturnType<typeof askGemini>>;
      let used = "";
      for (let first = true; ; first = false) {
        const m = pool.pick(Date.now());
        if (!m) throw lastError ?? new Error("все модели Gemini в перерыве");
        if (!first) requests++; // каждая следующая модель на странице — ещё один запрос в потолок
        try {
          r = await askGemini(LEAFLET_PROMPT, LEAFLET_SCHEMA, { apiKey, model: m, attempts: 1, image: { mimeType: "image/jpeg", data: image } });
          recordSuccess(usageOf(m), r);
          used = m;
          break;
        } catch (e) {
          recordFailure(usageOf(m), e instanceof Error ? e : { message: String(e) }, new Date()); // запрос уже ушёл в квоту
          if (e instanceof GeminiError && (e.status === 401 || e.status === 403)) throw e; // ключ не подходит ни к одной модели
          lastError = e instanceof Error ? e : new Error(String(e));
          pool.fail(m, Date.now());
          console.warn(`стр. ${page.number}: ${m} недоступна (${lastError.message}), дальше другая модель; основная вернётся через ${COOLDOWN_MS / 60_000} мин`);
        }
      }
      // Сырой ответ модели лежит в debug/ (в .gitignore, в Actions выгружается артефактом при сбое): по нему видно, что она прочитала.
      await mkdir("debug", { recursive: true });
      await writeFile(`debug/leaflet-${flyer.startsAt}-p${page.number}.json`, r.text);
      const { offers, invalid } = toLeafletOffers(r.text, { flyer, identifier, page: page.number });
      invalidAll.push(...invalid.map((s) => `стр. ${page.number}: ${s}`));
      if (!DRY && offers.length > 0) {
        const seen = new Date().toISOString();
        const { error } = await grocery.from("leaflet_offers").upsert(
          offers.map((o) => ({
            source_id: source.id,
            flyer_id: flyer.id,
            page: page.number,
            external_id: o.externalId,
            title: o.title,
            brand: o.brand,
            packaging: o.packaging,
            price: o.price,
            old_price: o.oldPrice,
            price_card: o.priceCard,
            price_second: o.priceSecond,
            discount_percent: o.discountPercent,
            unit_price: o.unitPrice,
            unit: o.unit,
            condition: o.condition,
            starts_at: o.startsAt!,
            ends_at: o.endsAt!,
            url: o.url,
            page_image_url: page.image,
            model: used,
            photo_box: o.photoBox,
            last_seen_at: seen,
          })),
          { onConflict: "source_id,external_id" },
        );
        if (error) throw new Error(`запись в БД: ${error.message}`);
        // Модель пишет одно и то же название по-разному от чтения к чтению (ключ другой): строки страницы, не обновлённые этим
        // чтением, остатки прошлого. Удаляем их, иначе при каждом перечитывании копятся дубли.
        const { error: delError } = await grocery.from("leaflet_offers").delete().eq("source_id", source.id).eq("flyer_id", flyer.id).eq("page", page.number).lt("last_seen_at", seen);
        if (delError) throw new Error(`очистка остатков страницы: ${delError.message}`);
      }
      saved += offers.length;
      console.log(`стр. ${page.number}: ${offers.length} акций, отброшено ${invalid.length}, токенов ${r.tokensIn}+${r.tokensOut} (${used})`);
      if (DRY) for (const o of offers) console.log("   ", [o.title, o.packaging, o.price, o.oldPrice, o.priceCard, o.discountPercent, o.condition, o.startsAt?.slice(0, 10), o.endsAt?.slice(0, 10)].map((x) => x ?? "-").join(" | "));
    } catch (e) {
      failed++;
      const err = e instanceof Error ? e : { message: String(e) };
      console.error(`стр. ${page.number}: сбой: ${err.message}`);
      // Квота или ключ повторятся на каждой следующей странице: не жжём остаток. Другие сбои касаются одной страницы, но три подряд — это уже не она.
      if (("status" in err && typeof err.status === "number" && isFatalGeminiStatus(err.status)) || ++streak >= 3) stop = true;
      continue;
    }
    streak = 0;
  }
}

// Миниатюры фото товаров (leaflet_thumbs): режем из страницы по рамке Gemini для записей, у которых миниатюры ещё нет. Это и прочитанное
// сейчас, и добор для прочитанного раньше; Gemini не нужен, страницу качаем заново. Сбой миниатюры не роняет остальное, но считается сбоем запуска.
if (!DRY) {
  const nowIso = new Date().toISOString();
  const [{ data: wanted, error: wantedError }, { data: have, error: haveError }] = await Promise.all([
    grocery.from("leaflet_offers").select("external_id, page_image_url, photo_box").eq("source_id", source.id).gte("ends_at", nowIso).not("photo_box", "is", null).not("page_image_url", "is", null).limit(1000),
    grocery.from("leaflet_thumbs").select("external_id").eq("source_id", source.id).limit(1000),
  ]);
  if (wantedError || haveError) throw wantedError ?? haveError;
  const had = new Set(have.map((r) => r.external_id));
  const byPage = new Map<string, typeof wanted>();
  for (const r of wanted) if (!had.has(r.external_id)) byPage.set(r.page_image_url!, [...(byPage.get(r.page_image_url!) ?? []), r]);
  let made = 0;
  for (const [pageUrl, offers] of byPage) {
    try {
      const page = sharp(Buffer.from(await (await get(pageUrl)).arrayBuffer()));
      const { width, height } = await page.metadata();
      const rows = [];
      for (const o of offers) {
        try {
          const photo = await page.clone().extract(cropRegion(o.photo_box!, width, height)).resize({ width: 320, height: 320, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
          rows.push({ source_id: source.id, external_id: o.external_id, photo: "\\x" + photo.toString("hex") }); // bytea в PostgREST: hex с префиксом \x
        } catch (e) {
          // Плохая рамка одной акции (ошибка модели) не стоит остальных миниатюр страницы и не роняет запуск: предупреждение, не сбой.
          console.warn(`миниатюра ${o.external_id}: пропущена: ${e instanceof Error ? e.message : e}`);
        }
      }
      if (!rows.length) continue;
      const { error } = await grocery.from("leaflet_thumbs").upsert(rows, { onConflict: "source_id,external_id" });
      if (error) throw new Error(error.message);
      made += rows.length;
    } catch (e) {
      failed++;
      console.error(`миниатюры страницы ...${pageUrl.slice(-30)}: сбой: ${e instanceof Error ? e.message : e}`);
    }
  }
  if (made) console.log(`\nМиниатюры фото: ${made}`);
}

let onSite = 0; // акций на сайте после запуска (для журнала запусков)
// Lidl на сайте только из буклета (решение владельца 2026-10-31): действующие записи буклета зеркалятся в grocery.offers, дальше лента, категории,
// сопоставление и сравнение цен работают как всегда. Зеркалим из таблицы, а не из этого запуска: прочитанные раньше страницы тоже в силе.
// Старые акции Lidl, которых нет в буклете (прежний парсер сайта), закрываем по дате (ends_at = сейчас): из ленты уходят, история цен остаётся.
if (!DRY) {
  const now = new Date().toISOString();
  // ponytail: потолок PostgREST 1000 строк, два буклета ≈ 500; больше станет — читать постранично.
  const { data: live, error: liveError } = await grocery.from("leaflet_offers").select("*").eq("source_id", source.id).gte("ends_at", now).order("flyer_id").order("page").order("id").limit(1000);
  if (liveError) throw liveError;
  const mirror = siteOffers(live);
  onSite = mirror.length;
  if (mirror.length > 0) {
    const { error } = await grocery.from("offers").upsert(mirror.map((o) => ({ ...o, source_id: source.id, last_seen_at: now })), { onConflict: "source_id,external_id" });
    if (error) throw new Error(`зеркало в offers: ${error.message}`);
    const { error: endError } = await grocery.from("offers").update({ ends_at: now }).eq("source_id", source.id).lt("last_seen_at", now).gt("ends_at", now);
    if (endError) throw new Error(`закрытие старых акций: ${endError.message}`);
    console.log(`\nНа сайт (grocery.offers): ${mirror.length} акций из ${live.length} записей буклета`);
  }
}

if (invalidAll.length) console.warn(`\nОтброшено записей: ${invalidAll.length}\n  ${invalidAll.join("\n  ")}`);

// Расход квоты: тот же счётчик, что у матчера (админка /grocery/admin/ai). Сбой записи учёта не роняет запуск.
for (const [m, usage] of usages) {
  if (!usage.requests && !usage.errors) continue;
  const { error } = await grocery.rpc("add_ai_usage", {
    p_day: pacificDay(new Date()),
    p_model: m,
    p_requests: usage.requests,
    p_tokens_in: usage.tokensIn,
    p_tokens_out: usage.tokensOut,
    p_errors: usage.errors,
    p_quota_hits: usage.quotaHits,
    p_last_error: usage.lastError,
    p_quota_hit_at: usage.quotaHitAt,
  });
  if (error) console.warn(`учёт квоты Gemini (${m}) не записан: ${error.message}`);
}
const sum = (f: (u: Usage) => number) => [...usages.values()].reduce((n, u) => n + f(u), 0);
console.log(`\nLidl буклет${DRY ? " (--dry)" : ""}: акций ${saved}, запросов к Gemini ${sum((u) => u.requests)} (${[...usages].map(([m, u]) => `${m}: ${u.requests}`).join(", ")}), токенов ${sum((u) => u.tokensIn)}+${sum((u) => u.tokensOut)}, сбоев ${failed}`);
// Журнал запусков (админка /grocery/admin/scrapers и метка «обновлено»): как у парсеров сайтов. items_count — акции на сайте после запуска.
if (!DRY) {
  const { error } = await sb.from("scrape_runs").insert({
    source_id: source.id,
    started_at: startedAt,
    status: failed ? "failed" : "success",
    items_count: onSite,
    invalid_count: invalidAll.length,
    error: failed ? (lastError?.message ?? `сбоев: ${failed}`) : null,
  });
  if (error) console.error("scrape_runs:", error.message);
}
// Ненулевой код → workflow падает → GitHub шлёт письмо (как у парсеров сайта).
if (failed) process.exitCode = 1;
