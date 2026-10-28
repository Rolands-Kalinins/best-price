import { createClient } from "@supabase/supabase-js";
import { activeFilter, buildMatches, diffLinks, isSuspiciousRun, normalizeBrand, type Database, type MatchItem } from "@bestprice/core";

const DRY = process.argv.includes("--dry");

const sb = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
const grocery = sb.schema("grocery");

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
const decisions = await readAll((a, b) => grocery.from("match_decisions").select("key_a,key_b,same").order("key_a").order("key_b").range(a, b));
const exclusions = await readAll((a, b) => grocery.from("match_exclusions").select("offer_id").order("offer_id").range(a, b));

// Бренды берём из полей магазинов: у Etop заполнено 94%, у Lidl 71%.
// ponytail: бренд, которого нет в полях Etop и Lidl, не распознаётся (Rimi и Maxima его не отдают); расширять словарь, если пропусков будет много.
const brands = new Set(rows.flatMap((r) => (r.brand ? [normalizeBrand(r.brand)] : [])).filter(Boolean));
const items: MatchItem[] = rows.filter((r) => r.price !== null).map((r) => ({ id: r.id, sourceId: r.source_id, title: r.title, brand: r.brand, condition: r.condition }));
const { groups, suggestions } = buildMatches(
  items,
  brands,
  decisions.map((d) => ({ keyA: d.key_a, keyB: d.key_b, same: d.same })),
  new Set(exclusions.map((e) => e.offer_id)),
);

console.log(`акций ${rows.length}, брендов ${brands.size}, групп ${groups.length}, предположений ${suggestions.length}`);
if (DRY) {
  const title = new Map(rows.map((r) => [r.id, `[${r.source_id}] ${r.title}`]));
  for (const g of groups.slice(0, 25)) console.log("\nГРУППА", g.key, "\n  " + g.offerIds.map((i) => title.get(i)).join("\n  "));
  for (const s of suggestions.slice(0, 15)) console.log("\nПРЕДПОЛОЖЕНИЕ", "\n  " + s.offerIds.map((i) => title.get(i)).join("\n  "));
  process.exit(0);
}

const linked = rows.filter((r) => r.product_id !== null).length;
const linkedAfter = groups.reduce((n, g) => n + g.offerIds.length, 0);
if (isSuspiciousRun({ rows: rows.length, linkedBefore: linked, linkedAfter })) {
  throw new Error(`Подозрительный результат: акций ${rows.length}, привязано было ${linked}, станет ${linkedAfter}. Запись отменена.`);
}

// ponytail: запись не атомарна (upsert, перепривязка и удаления отдельными запросами). Сбой посреди запуска оставляет очередь предположений
// пустой или неполной до следующего запуска; привязки согласованы (удалённый товар обнуляет product_id каскадом). Нужна SQL-функция в транзакции, если сбои станут частыми.

const chunks = <T>(xs: T[], n = 200) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const check = ({ error }: { error: { message: string } | null }) => {
  if (error) throw new Error(error.message);
};

// Товары: ключ стабилен, поэтому строка products переживает пересчёт; устаревшие ключи удаляем (product_id у акций обнулится каскадом).
const titleOf = new Map(rows.map((r) => [r.id, r.title]));
const { data: products, error: productsError } = await grocery
  .from("products")
  .upsert(groups.map((g) => ({ key: g.key, title: titleOf.get(g.offerIds[0])! })), { onConflict: "key" })
  .select("id,key");
if (productsError) throw productsError;
const productId = new Map(products.map((p) => [p.key, p.id]));

// Меняем product_id только там, где он изменился.
const want = new Map<number, number>(groups.flatMap((g) => g.offerIds.map((id) => [id, productId.get(g.key)!] as const)));
const { toSet, toClear } = diffLinks(rows.map((r) => ({ id: r.id, productId: r.product_id })), want);
for (const [pid, ids] of toSet) for (const part of chunks(ids)) check(await grocery.from("offers").update({ product_id: pid }).in("id", part));
for (const part of chunks(toClear)) check(await grocery.from("offers").update({ product_id: null }).in("id", part));

const keep = new Set(productId.values());
const { data: all, error: allError } = await grocery.from("products").select("id");
if (allError) throw allError;
const stale = all.map((p) => p.id).filter((id) => !keep.has(id));
for (const part of chunks(stale)) check(await grocery.from("products").delete().in("id", part));

// Предположения пересоздаём целиком; решённые пары в buildMatches уже не попадают.
check(await grocery.from("match_suggestions").delete().neq("key_a", ""));
for (const part of chunks(suggestions, 500))
  check(await grocery.from("match_suggestions").insert(part.map((s) => ({ key_a: s.keyA, key_b: s.keyB, offer_ids: s.offerIds }))));

console.log(`Записано: товаров ${groups.length}, акций привязано ${want.size}, снято ${toClear.length}, удалено товаров ${stale.length}`);
