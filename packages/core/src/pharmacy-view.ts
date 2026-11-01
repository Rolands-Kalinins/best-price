// Чистые функции страницы «Аптеки»: используются интерфейсом, тестируются отдельно.
import { MAX_OFFERS, PAGE_SIZE } from "./offer-view";
import { PHARMACY_CATEGORIES } from "./pharmacy-categories";

export type PharmacySort = "discount" | "price" | "name";
// sale: только со скидкой (есть старая цена); card: только с действующей ценой по карте магазина.
export type PharmacyQuery = { q: string; store: number | null; cat: string | null; sale: boolean; card: boolean; sort: PharmacySort; n: number };

const SORTS: readonly PharmacySort[] = ["discount", "price", "name"];

/** Параметры адреса → запрос. Мусор заменяется значениями по умолчанию (как parseQuery у акций). */
export function parsePharmacyQuery(sp: URLSearchParams): PharmacyQuery {
  const store = Number(sp.get("store"));
  const sort = sp.get("sort") as PharmacySort;
  const n = Number(sp.get("n"));
  return {
    q: sp.get("q") ?? "",
    store: Number.isInteger(store) && store > 0 ? store : null,
    cat: PHARMACY_CATEGORIES.some((c) => c.slug === sp.get("cat")) ? sp.get("cat") : null,
    sale: sp.get("sale") === "1",
    card: sp.get("card") === "1",
    sort: SORTS.includes(sort) ? sort : "discount",
    n: Number.isInteger(n) ? Math.min(Math.max(n, PAGE_SIZE), MAX_OFFERS) : PAGE_SIZE,
  };
}

const STALE_DAYS = 3;

/** Товар виден, если парсер видел его за последние STALE_DAYS дней: каталог хранится целиком и пропавший товар сам не удаляется. */
export function freshSince(now: Date): string {
  return new Date(now.getTime() - STALE_DAYS * 86_400_000).toISOString();
}

/** Цена по карте действует сейчас: она есть, началась и не закончилась (пустая дата = без ограничения). */
export function cardActive(p: { card_price: number | null; card_starts_at: string | null; card_ends_at: string | null }, now: Date): boolean {
  if (p.card_price === null) return false;
  const t = now.getTime();
  return (p.card_starts_at === null || new Date(p.card_starts_at).getTime() <= t) && (p.card_ends_at === null || new Date(p.card_ends_at).getTime() > t);
}

/** Строка сравнения цен: тот же товар (по штрихкоду) в одной из аптек. Отдаёт pharmacy.compare_prices. */
export type PriceRow = { ean: string; source_id: number; price: number; in_stock: boolean; url: string | null };

export const groupByEan = (rows: PriceRow[]): Map<string, PriceRow[]> => {
  const m = new Map<string, PriceRow[]>();
  for (const r of rows) m.set(r.ean, [...(m.get(r.ean) ?? []), r]);
  return m;
};

/** Тот же товар в других аптеках (только в наличии, от дешёвых) и самая дешёвая из них, если она дешевле нашей цены. */
export function comparePrices(own: { source_id: number; price: number }, rows: PriceRow[]): { others: PriceRow[]; cheaper: PriceRow | null } {
  const others = rows.filter((r) => r.source_id !== own.source_id && r.in_stock).sort((a, b) => a.price - b.price);
  return { others, cheaper: others[0] && others[0].price < own.price ? others[0] : null };
}
