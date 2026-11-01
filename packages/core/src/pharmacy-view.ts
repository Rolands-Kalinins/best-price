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

/** Товар группы (один и тот же в разных аптеках): строка pharmacy.group_members. */
export type GroupMember = {
  id: number;
  group_id: number;
  source_id: number;
  title: string;
  price: number;
  old_price: number | null;
  discount: number | null;
  card_price: number | null;
  card_condition: string | null;
  card_starts_at: string | null;
  card_ends_at: string | null;
  prescription: boolean;
  url: string | null;
  image_url: string | null;
};

/** Участники по номеру группы, от дешёвых (id как ничья). Не в наличии сюда не попадают: функция отдаёт только товары в наличии. */
export function groupMembers(rows: GroupMember[]): Map<number, GroupMember[]> {
  const out = new Map<number, GroupMember[]>();
  for (const r of [...rows].sort((a, b) => a.price - b.price || a.id - b.id)) {
    out.set(r.group_id, [...(out.get(r.group_id) ?? []), r]);
  }
  return out;
}
