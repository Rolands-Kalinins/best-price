import { createClient } from "@supabase/supabase-js";
import {
  activeFilter,
  batches,
  BATCH_SIZE,
  BRAND_SCHEMA,
  brandPrompt,
  buildMatches,
  diffLinks,
  isSuspiciousRun,
  needBrand,
  normalizeBrand,
  parseBrandReply,
  parseVerdictReply,
  PROMPT_VERSION,
  titleKey,
  VERDICT_SCHEMA,
  verdictPrompt,
  type Database,
  type MatchItem,
  type Verdict,
} from "@bestprice/core";
import { askGemini } from "./gemini";

const DRY = process.argv.includes("--dry");

const sb = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const grocery = sb.schema("grocery");

const check = ({ error }: { error: { message: string } | null }) => {
  if (error) throw new Error(error.message);
};

// PostgREST отдаёт не больше 1000 строк за запрос (docs/findings/2026-10-27-rest-1000-rows-cap.md): читаем страницами.
type Row = { id: number; source_id: number; title: string; brand: string | null; condition: string | null; price: number | null; product_id: number | null };
const rows: Row[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await grocery
    .from("offers")
    .select("id,source_id,title,brand,condition,price,product_id")
    .or(activeFilter(new Date()))
    .order("id")
    .range(from, from + 999);
  if (error) throw error;
  rows.push(...data);
  if (data.length < 1000) break;
}

// Тот же потолок в 1000 строк у решений и исключений: усечённое чтение молча потеряло бы решения админа.
async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    all.push(...data!);
    if (data!.length < 1000) return all;
  }
}
// Кэш Gemini: в --dry допустимо читать до миграции (таблиц ещё нет), в боевом режиме их отсутствие — ошибка.
const readCache = <T>(page: Parameters<typeof readAll<T>>[0]) =>
  readAll(page).catch((e) => {
    if (!DRY) throw e;
    console.warn(`кэш Gemini не прочитан (${e.message}), для --dry считаем его пустым`);
    return [] as T[];
  });
const decisions = await readAll((a, b) => grocery.from("match_decisions").select("key_a,key_b,same").order("key_a").order("key_b").range(a, b));
const exclusions = await readAll((a, b) => grocery.from("match_exclusions").select("offer_id").order("offer_id").range(a, b));

// Gemini помогает, но не обязателен: нет ключа, лимит запросов или сбой API — матчер работает с тем, что уже в кэше (title_attrs, pair_verdicts).
const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL ?? "gemini-3.1-flash-lite";
const maxEnv = Number(process.env.GEMINI_MAX_REQUESTS);
const maxRequests = Number.isFinite(maxEnv) && maxEnv > 0 ? maxEnv : 30; // пусто или не число: потолок по умолчанию, а не «без потолка»
// Потолок действует отдельно на бренды и на советы (счётчик обнуляется между фазами), иначе первый большой прогон брендов съел бы советы.
let requests = 0;
let totalRequests = 0;
let down = false; // после первой окончательной неудачи (неверный ключ или модель, исчерпанная квота) остальные запросы этого запуска не делаем
async function ask(prompt: string, schema: object): Promise<string | null> {
  if (!apiKey || down || requests >= maxRequests) return null;
  requests++;
  totalRequests++;
  try {
    return await askGemini(prompt, schema, { apiKey, model });
  } catch (e) {
    down = true;
    const msg = `Gemini: ${e instanceof Error ? e.message : e}. Дальше в этом запуске без Gemini (модель ${model}).`;
    console.warn(process.env.GITHUB_ACTIONS ? `::warning::${msg}` : msg); // в Actions виден аннотацией, зелёный запуск не прячет сбой
    return null;
  }
}

// Бренд из названия для акций, где магазин его не отдаёт (Rimi, Maxima). Модель отвечает пачками, ответ кэшируется по названию.
// acceptBrand принимает бренд, только если он дословно есть в названии. В режиме --dry в БД ничего не пишется.
const priced = rows.filter((r) => r.price !== null);
const attrs = new Map(
  (await readCache((a, b) => grocery.from("title_attrs").select("title_key,brand").eq("prompt_version", PROMPT_VERSION).order("title_key").range(a, b))).map((r) => [r.title_key, r.brand]),
);
const asked: { title: string; brand: string | null }[] = [];
for (const part of batches(needBrand(priced, new Set(attrs.keys())), BATCH_SIZE)) {
  const text = await ask(brandPrompt(part), BRAND_SCHEMA);
  if (!text) break;
  let found: (string | null | undefined)[];
  try {
    found = parseBrandReply(text, part);
  } catch (e) {
    console.warn(`Gemini: ответ с брендами не разобран (${e instanceof Error ? e.message : e}), пачка пропущена`);
    continue;
  }
  // Пропущенные моделью названия (undefined) не кэшируем: спросим в следующий раз.
  const answered = part.flatMap((title, i) => (found[i] === undefined ? [] : [{ title, brand: found[i]! }]));
  const out = answered.map((a) => ({ title_key: titleKey(a.title), prompt_version: PROMPT_VERSION, brand: a.brand }));
  for (const o of out) attrs.set(o.title_key, o.brand);
  asked.push(...answered);
  if (!DRY) check(await grocery.from("title_attrs").upsert(out, { onConflict: "title_key,prompt_version" }));
}

// Бренды берём из полей магазинов: у Etop заполнено 94%, у Lidl 71%; у остальных из названия через Gemini.
const brands = new Set(rows.flatMap((r) => (r.brand ? [normalizeBrand(r.brand)] : [])).filter(Boolean));
const toItems = (useAi: boolean): MatchItem[] =>
  priced.map((r) => ({
    id: r.id,
    sourceId: r.source_id,
    title: r.title,
    brand: r.brand?.trim() || (useAi ? attrs.get(titleKey(r.title)) ?? null : null),
    condition: r.condition,
  }));
const decisionList = decisions.map((d) => ({ keyA: d.key_a, keyB: d.key_b, same: d.same }));
const excluded = new Set(exclusions.map((e) => e.offer_id));
const { groups, suggestions } = buildMatches(toItems(true), brands, decisionList, excluded);

// Совет по предположениям: «тот же товар?» с причиной. Никого не объединяет, его видит админ в очереди.
// ponytail: в запрос идут первые 6 акций предположения по id; если акций много, одна из сторон может не попасть. Брать по 2-3 с каждой стороны, если вердикты начнут ошибаться.
const titleOf = new Map(rows.map((r) => [r.id, r.title]));
const pairKey = (a: string, b: string) => `${a}\n${b}`;
const verdicts = new Map<string, Verdict>(
  (await readCache((a, b) => grocery.from("pair_verdicts").select("key_a,key_b,same,reason").eq("prompt_version", PROMPT_VERSION).order("key_a").order("key_b").range(a, b))).map((v) => [
    pairKey(v.key_a, v.key_b),
    { same: v.same, reason: v.reason },
  ]),
);
requests = 0; // отдельный потолок для советов
for (const part of batches(suggestions.filter((s) => !verdicts.has(pairKey(s.keyA, s.keyB))), BATCH_SIZE)) {
  const text = await ask(verdictPrompt(part.map((s) => s.offerIds.slice(0, 6).map((id) => titleOf.get(id)!))), VERDICT_SCHEMA);
  if (!text) break;
  let found: (Verdict | null)[];
  try {
    found = parseVerdictReply(text, part.length);
  } catch (e) {
    console.warn(`Gemini: ответ с вердиктами не разобран (${e instanceof Error ? e.message : e}), пачка пропущена`);
    continue;
  }
  const out = part.flatMap((s, i) => (found[i] ? [{ key_a: s.keyA, key_b: s.keyB, prompt_version: PROMPT_VERSION, ...found[i]! }] : []));
  for (const o of out) verdicts.set(pairKey(o.key_a, o.key_b), { same: o.same, reason: o.reason });
  if (!DRY) check(await grocery.from("pair_verdicts").upsert(out, { onConflict: "key_a,key_b,prompt_version" }));
}

console.log(`акций ${rows.length}, брендов ${brands.size}, групп ${groups.length}, предположений ${suggestions.length}; Gemini: запросов ${totalRequests}, названий спрошено ${asked.length}`);
if (DRY) {
  const title = new Map(rows.map((r) => [r.id, `[${r.source_id}] ${r.title}`]));
  const base = buildMatches(toItems(false), brands, decisionList, excluded);
  const count = (gs: { offerIds: number[] }[]) => gs.reduce((n, g) => n + g.offerIds.length, 0);
  console.log(`\nБЕЗ Gemini: групп ${base.groups.length}, акций в группах ${count(base.groups)}, предположений ${base.suggestions.length}`);
  console.log(`С Gemini:   групп ${groups.length}, акций в группах ${count(groups)}, предположений ${suggestions.length}`);

  const step = Math.max(1, Math.floor(asked.length / 50));
  console.log(`\nВЫБОРКА БРЕНДОВ (каждое ${step}-е из ${asked.length}):`);
  for (const a of asked.filter((_, i) => i % step === 0).slice(0, 50)) console.log(`  ${a.brand ?? "—"}  ←  ${a.title}`);

  const baseKeys = new Set(base.groups.map((g) => g.key));
  const fresh = groups.filter((g) => !baseKeys.has(g.key));
  console.log(`\nНОВЫЕ ГРУППЫ (${fresh.length}, показаны 30):`);
  for (const g of fresh.slice(0, 30)) console.log("\n  " + g.key + "\n    " + g.offerIds.map((i) => title.get(i)).join("\n    "));

  console.log("\nСОВЕТЫ ПО ПРЕДПОЛОЖЕНИЯМ (первые 15):");
  for (const s of suggestions.slice(0, 15)) {
    const v = verdicts.get(pairKey(s.keyA, s.keyB));
    console.log(`\n  ${v ? (v.same ? "ТОТ ЖЕ" : "РАЗНЫЕ") + " — " + v.reason : "нет совета"}\n    ` + s.offerIds.slice(0, 6).map((i) => title.get(i)).join("\n    "));
  }
  process.exit(0);
}

const linked = rows.filter((r) => r.product_id !== null).length;
const linkedAfter = groups.reduce((n, g) => n + g.offerIds.length, 0);
if (isSuspiciousRun({ rows: rows.length, linkedBefore: linked, linkedAfter })) {
  throw new Error(`Подозрительный результат: акций ${rows.length}, привязано было ${linked}, станет ${linkedAfter}. Запись отменена.`);
}

// ponytail: запись не атомарна (upsert, перепривязка и удаления отдельными запросами). Сбой посреди запуска оставляет очередь предположений
// пустой или неполной до следующего запуска; привязки согласованы (удалённый товар обнуляет product_id каскадом). Нужна SQL-функция в транзакции, если сбои станут частыми.

// Товары: ключ стабилен, поэтому строка products переживает пересчёт; устаревшие ключи удаляем (product_id у акций обнулится каскадом).
const { data: products, error: productsError } = await grocery
  .from("products")
  .upsert(groups.map((g) => ({ key: g.key, title: titleOf.get(g.offerIds[0])! })), { onConflict: "key" })
  .select("id,key");
if (productsError) throw productsError;
const productId = new Map(products.map((p) => [p.key, p.id]));

// Меняем product_id только там, где он изменился.
const want = new Map<number, number>(groups.flatMap((g) => g.offerIds.map((id) => [id, productId.get(g.key)!] as const)));
const { toSet, toClear } = diffLinks(rows.map((r) => ({ id: r.id, productId: r.product_id })), want);
for (const [pid, ids] of toSet) for (const part of batches(ids, 200)) check(await grocery.from("offers").update({ product_id: pid }).in("id", part));
for (const part of batches(toClear, 200)) check(await grocery.from("offers").update({ product_id: null }).in("id", part));

const keep = new Set(productId.values());
const { data: all, error: allError } = await grocery.from("products").select("id");
if (allError) throw allError;
const stale = all.map((p) => p.id).filter((id) => !keep.has(id));
for (const part of batches(stale, 200)) check(await grocery.from("products").delete().in("id", part));

// Предположения пересоздаём целиком; решённые пары в buildMatches уже не попадают.
check(await grocery.from("match_suggestions").delete().neq("key_a", ""));
for (const part of batches(suggestions, 500))
  check(
    await grocery.from("match_suggestions").insert(
      part.map((s) => {
        const v = verdicts.get(pairKey(s.keyA, s.keyB));
        return { key_a: s.keyA, key_b: s.keyB, offer_ids: s.offerIds, ai_same: v?.same ?? null, ai_reason: v?.reason ?? null };
      }),
    ),
  );

console.log(`Записано: товаров ${groups.length}, акций привязано ${want.size}, снято ${toClear.length}, удалено товаров ${stale.length}`);
