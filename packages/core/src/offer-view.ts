// Чистые функции показа акций: используются интерфейсом, тестируются отдельно.

/** Скидка в целых процентах; null, если старой цены нет, она не выше новой или скидка меньше 1%. */
export function discountPercent(price: number, oldPrice: number | null): number | null {
  if (oldPrice === null || oldPrice <= price) return null;
  const pct = Math.round((1 - price / oldPrice) * 100);
  return pct >= 1 ? pct : null;
}

/** Скидка акции: у скидки на бренд/категорию процент задан, у остальных считается по старой цене. */
export function offerDiscount(o: { price: number | null; old_price: number | null; discount_percent: number | null }): number | null {
  return o.discount_percent ?? (o.price === null ? null : discountPercent(o.price, o.old_price));
}

/** Ссылка и картинка приходят из парсера: пропускаем только абсолютные http(s), остальное (javascript:, data:) отбрасываем. */
export function safeHttpUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const { protocol } = new URL(url);
    return protocol === "http:" || protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

export type OfferSort = "discount" | "price" | "ends";
// scope: только скидки на бренд или категорию (у них нет цены).
// n: сколько акций показать (растёт кнопкой «Показать ещё»). Потолок 1000 — лимит строк ответа API.
export type OfferQuery = { q: string; store: number | null; cond: boolean; scope: boolean; sort: OfferSort; n: number };

export const PAGE_SIZE = 60; // делится на 2, 3 и 4 колонки сетки: последний ряд не остаётся неполным
export const MAX_OFFERS = 1000;

const SORTS: readonly OfferSort[] = ["discount", "price", "ends"];

/** Параметры адреса → запрос. Мусор заменяется значениями по умолчанию. */
export function parseQuery(sp: URLSearchParams): OfferQuery {
  const store = Number(sp.get("store"));
  const sort = sp.get("sort") as OfferSort;
  const n = Number(sp.get("n"));
  return {
    q: sp.get("q") ?? "",
    store: Number.isInteger(store) && store > 0 ? store : null,
    cond: sp.get("cond") === "1",
    scope: sp.get("scope") === "1",
    sort: SORTS.includes(sort) ? sort : "discount",
    n: Number.isInteger(n) ? Math.min(Math.max(n, PAGE_SIZE), MAX_OFFERS) : PAGE_SIZE,
  };
}

// Те же замены делает столбец grocery.offers.search (миграция offers_scale): запрос и данные должны нормализоваться одинаково.
export const SEARCH_FROM = "āčēģīķļņšūžäöüõ";
export const SEARCH_TO = "acegiklnsuzaouo";

/** Слова поиска: без регистра и диакритики, «Šokolāde» и «sokolade» — одно слово. */
export function searchTerms(q: string): string[] {
  const plain = [...q.toLowerCase()].map((c) => (SEARCH_FROM.includes(c) ? SEARCH_TO[SEARCH_FROM.indexOf(c)] : c)).join("");
  return plain.replace(/[%_\\*]/g, " ").split(/\s+/).filter(Boolean);
}

const STALE_DAYS = 3;

/**
 * Условие PostgREST `.or()`: действующие акции. Есть дата окончания — по ней; нет даты (EDLP, карточка не открылась) —
 * действует, пока товар виден в запусках за последние STALE_DAYS дней (FR-34), иначе пропавший товар висел бы вечно.
 */
export function activeFilter(now: Date): string {
  const stale = new Date(now.getTime() - STALE_DAYS * 86_400_000).toISOString();
  return `ends_at.gt.${now.toISOString()},and(ends_at.is.null,last_seen_at.gt.${stale})`;
}

/** Сравнение цен товара: в каждом магазине одна самая дешёвая акция, от дешёвой к дорогой. Скидки без цены не участвуют. */
export function storePrices<T extends { source_id: number; price: number | null }>(offers: T[]): (T & { price: number })[] {
  const best = new Map<number, T & { price: number }>();
  for (const o of offers) {
    if (o.price === null) continue;
    const cur = best.get(o.source_id);
    if (!cur || o.price < cur.price) best.set(o.source_id, o as T & { price: number });
  }
  return [...best.values()].sort((a, b) => a.price - b.price);
}

/** На сколько цена выше лучшей: в евро и процентах от лучшей (округление до целых процентов). */
export function priceGap(price: number, best: number): { eur: number; pct: number } {
  return { eur: Math.round((price - best) * 100) / 100, pct: best > 0 ? Math.round((price / best - 1) * 100) : 0 };
}
