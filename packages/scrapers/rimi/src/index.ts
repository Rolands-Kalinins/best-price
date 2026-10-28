import { mkdir, writeFile } from "node:fs/promises";
import { type Offer, type ScrapeResult, offerSchema, rigaIso } from "@bestprice/core";

const ORIGIN = "https://www.rimi.lv";
// Список акций: SSR-HTML, cookies не нужны. pageSize сервер режет до 100 (на 2026-10-27 было 3912 плиток, 40 страниц).
// /robots.txt закрывает только /admin/, поиск, корзину и аккаунт (проверено 2026-10-26).
const LIST = `${ORIGIN}/e-veikals/lv/akcijas-piedavajumi`;
const PAGE_SIZE = 100;
const MAX_PAGES = 100;
const USER_AGENT = "BestPriceBot (personal project)";
const CARD = "Ar MansRimi karti";
const MAX_INVALID = 0.05;
const ATTEMPTS = 3;

export type Period = { startsAt: string | null; endsAt: string | null };

const ENTITIES: Record<string, string> = { amp: "&", quot: '"', lt: "<", gt: ">", apos: "'" };
const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&(amp|quot|lt|gt|apos);/g, (_, e) => ENTITIES[e])
    .replace(/\s+/g, " ")
    .trim();

// «Cena par vienību: 7,76 €/kg» или «7,76 €/kg» в этикетке; за штуку («€/gab.») единицы нет.
function unitOf(s: string | undefined) {
  const m = s?.match(/(\d+),(\d{2})\s*€\/(kg|l)\b/);
  return m ? { unitPrice: Number(`${m[1]}.${m[2]}`), unit: m[3] as "kg" | "l" } : { unitPrice: null, unit: null };
}

// Плитка бывает четырёх видов: старая цена; цена по карте в этикетке (обычная цена в деталях);
// «N un vairāk» с ценой и старой ценой в этикетке; «Ja liec grozā N» (цена за N штук); и просто цена (EDLP).
function toOffer(tile: string): unknown {
  const field = (re: RegExp, s = tile) => s.match(re)?.[1];
  const label = field(/<div class="price-label"([\s\S]*?)<div class="type-badge/);
  const details = field(/class="price-tag card__price">\s*<span class="sr-only">\s*(\d+\.\d{2})/);
  const regular = details ? Number(details) : null;

  let price = regular;
  let oldPrice: number | null = null;
  const condition: string[] = [];
  let unitText = field(/Cena par vienību:([^<]*)</);
  if (label) {
    const [, major, cents] = label.match(/class="major">\s*(\d+)\s*<[\s\S]*?class="cents">\s*(\d+)\s*</) ?? [];
    price = Number(`${major}.${cents}`);
    const qty = Number(field(/Ja liec grozā (\d+)/, label) ?? 1);
    const labelOld = label.match(/price-label__old-price">\s*(\d+),(\d{2})/);
    oldPrice = labelOld
      ? Number(`${labelOld[1]}.${labelOld[2]}`)
      : regular && regular * qty > price ? Math.round(regular * qty * 100) / 100 : null;
    if (label.includes("rimi-card")) condition.push(CARD);
    const text = field(/price-label__text">\s*<span>([^<]*)</, label);
    if (text) condition.push(decode(text));
    // Цена в этикетке за N упаковок (7,81 €/кг против 15,59 €/кг за одну): как «Cena par 2 gab.» у Maxima.
    if (qty > 1) condition.push(`Cena par ${qty} gab.`);
    unitText = field(/price-per-unit">([^<]*)</, label);
  } else {
    const old = tile.match(/Regulārā cena:\s*(\d+),(\d{2})/);
    oldPrice = old ? Number(`${old[1]}.${old[2]}`) : null;
  }

  const href = field(/class="card__url[^>]*href="([^"]*)"/);
  return {
    externalId: field(/^"(\d+)"/),
    title: decode(field(/<p class="card__name">([^<]*)</) ?? ""),
    brand: null, // в данных плитки бренда нет (0 из 3912)
    packaging: null,
    price,
    oldPrice,
    discountPercent: null,
    ...unitOf(unitText),
    condition: condition.join(" · ") || null,
    startsAt: null, // период есть только в карточке товара, см. parseCard
    endsAt: null,
    ean: null, // на сайте штрихкодов нет
    // Только путь на этом же сайте: парсер сам ходит по этому адресу за периодом, «@host» или «//host» увели бы его на чужой хост.
    url: href && /^\/(?!\/)/.test(href) ? ORIGIN + href : null,
    imageUrl: field(/data-src="([^"]*)"/) ?? null,
    category: field(/"category":"([^"]*)"/) ?? null, // код SH-<раздел>-<подраздел>-<группа>
  };
}

export function parse(html: string): ScrapeResult {
  const offers: Offer[] = [];
  let invalid = 0;
  for (const tile of html.split("<div data-product-code=").slice(1)) {
    try {
      const parsed = offerSchema.safeParse(toOffer(tile.split("</li>")[0]));
      if (parsed.success) offers.push(parsed.data);
      else invalid++;
    } catch {
      invalid++;
    }
  }
  return { offers, invalid };
}

// «Piedāvājums spēkā no 20.10.2026 līdz 02.11.2026» на карточке товара.
export function parseCard(html: string): Period | null {
  const m = html.match(/spēkā no\s+(\d+)\.(\d+)\.(\d{4})\s+līdz\s+(\d+)\.(\d+)\.(\d{4})/);
  if (!m) return null;
  const [d1, m1, y1, d2, m2, y2] = m.slice(1).map(Number);
  return { startsAt: rigaIso(y1, m1, d1, 0, 0, 0), endsAt: rigaIso(y2, m2, d2, 23, 59, 59) };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Таймаут: зависший запрос не должен подвесить прогон на ~4 тыс. запросов. Но одиночный сбой сети или медленный ответ
// (один таймаут уже убил запуск в GitHub Actions) не должен ронять весь прогон: три попытки с нарастающей паузой.
// Повторяем сетевые ошибки и HTTP 5xx/429; остальные 4xx (403, 404) повтор не исправит.
async function get(url: string, retryMs: number): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    let failure: unknown;
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(30_000) });
      if (res.ok) return await res.text();
      failure = new Error(`Rimi: HTTP ${res.status} ${url}`);
      if (res.status < 500 && res.status !== 429) throw failure;
    } catch (e) {
      if (e === failure) throw e;
      failure = e;
    }
    if (attempt === ATTEMPTS) throw failure;
    await wait(retryMs * attempt);
  }
}

// known: периоды уже сохранённых действующих акций (по externalId), чтобы не ходить за карточкой повторно.
// Порядок на сервере нестабилен (один проход теряет ~1% товаров, а часть показывает дважды), поэтому проходов несколько.
// ponytail: карточки по одной с паузой (первый запуск ~3,9 тыс. запросов); период известной акции не обновляем до её конца.
export async function scrape(known: Map<string, Period>, opts: { passes?: number; delayMs?: number; retryMs?: number } = {}): Promise<ScrapeResult> {
  const { passes = 3, delayMs = 250, retryMs = 3000 } = opts;
  const byId = new Map<string, Offer>();
  let invalid = 0;
  for (let pass = 1; pass <= passes; pass++) {
    let passInvalid = 0;
    for (let page = 1; ; page++) {
      if (page > MAX_PAGES) throw new Error(`Rimi: больше ${MAX_PAGES} страниц, пагинация могла измениться`);
      const html = await get(`${LIST}?pageSize=${PAGE_SIZE}&currentPage=${page}`, retryMs);
      // Сырая первая страница лежит в debug/: workflow выгружает её артефактом только при сбое (FR-30).
      if (pass === 1 && page === 1) {
        await mkdir("debug", { recursive: true });
        await writeFile("debug/rimi.html", html);
      }
      const { offers, invalid: bad } = parse(html);
      passInvalid += bad;
      for (const o of offers) if (!byId.has(o.externalId)) byId.set(o.externalId, o);
      if (offers.length + bad < PAGE_SIZE) break; // неполная страница — последняя
      await wait(delayMs);
    }
    invalid = Math.max(invalid, passInvalid);
    await wait(delayMs);
  }
  const tiles = byId.size + invalid;
  // Сейчас невалидных 0; порог ловит смену разметки, когда «успех» был бы с огрызком данных.
  if (invalid > tiles * MAX_INVALID) {
    throw new Error(`Rimi: не разобрано ${invalid} из ${tiles} акций, разметка могла измениться`);
  }
  if (byId.size === 0) throw new Error("Rimi: ни одной акции, формат мог измениться");

  const offers = [...byId.values()];
  let fetched = 0;
  for (const o of offers) {
    const period = known.get(o.externalId);
    if (period) {
      Object.assign(o, period);
      continue;
    }
    // Сбой карточки не роняет запуск: акция без дат считается действующей (как в веб-выборке).
    try {
      Object.assign(o, parseCard(await get(o.url, retryMs)));
    } catch {}
    if (++fetched % 500 === 0) console.log(`Rimi: карточек ${fetched}`);
    await wait(delayMs);
  }
  return { offers, invalid };
}
