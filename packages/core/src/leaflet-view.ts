// Логика страницы админа «Буклеты»: строки grocery.leaflet_offers по страницам буклета и срок плитки, если он отличается от срока буклета.
import type { Database } from "./database.types";
import { unitPrice } from "./offer";
import { safeHttpUrl } from "./offer-view";

export type LeafletRow = Database["grocery"]["Tables"]["leaflet_offers"]["Row"];
export type LeafletPage = { page: number; url: string | null; imageUrl: string | null; rows: (LeafletRow & { n: number })[] };

/** Строки по страницам в порядке чтения; n — сквозной номер строки по всему буклету с 1. Ссылки в базе чужие, поэтому проходят safeHttpUrl. */
export function groupPages(rows: LeafletRow[]): LeafletPage[] {
  const sorted = [...rows].sort((a, b) => a.page - b.page || a.id - b.id);
  const pages: LeafletPage[] = [];
  sorted.forEach((r, i) => {
    let p = pages.at(-1);
    if (p?.page !== r.page) pages.push((p = { page: r.page, url: null, imageUrl: null, rows: [] }));
    p.url ??= safeHttpUrl(r.url);
    p.imageUrl ??= safeHttpUrl(r.page_image_url ?? "");
    p.rows.push({ ...r, n: i + 1 });
  });
  return pages;
}

/**
 * CSS для вырезки фото товара из картинки страницы без хранения своих картинок: рамка [ymin, xmin, ymax, xmax] в долях 0–1000.
 * Контейнер (aspect-ratio) и картинка внутри (абсолютно, сдвиг и ширина в процентах контейнера). PAGE_RATIO: страницы Lidl 1441×2400.
 */
export const PAGE_RATIO = 1441 / 2400;
export function cropStyle(box: number[]): { box: { aspectRatio: string }; img: { width: string; left: string; top: string } } {
  const [y0, x0, y1, x1] = box;
  const w = x1 - x0;
  const h = y1 - y0;
  const pct = (n: number) => `${+n.toFixed(2)}%`;
  return {
    box: { aspectRatio: String(+((w * PAGE_RATIO) / h).toFixed(4)) },
    img: { width: pct((1000 / w) * 100), left: pct((-x0 / w) * 100), top: pct((-y0 / h) * 100) },
  };
}

export type SiteOffer = Pick<Database["grocery"]["Tables"]["offers"]["Insert"], "external_id" | "title" | "brand" | "packaging" | "price" | "old_price" | "discount_percent" | "unit_price" | "unit" | "condition" | "starts_at" | "ends_at" | "url" | "image_url">;

/**
 * Записи буклета → акции сайта (grocery.offers), чтобы лента, категории, сопоставление и сравнение цен работали как для любого магазина.
 * Цена по карте (Lidl Plus) становится ценой акции, обычная идёт в «было», условие «Lidl Plus». Без цены и процента («2+1») акцию
 * сайту не показать (check offers_price_or_discount): пропускается, остаётся в leaflet_offers. Фото: своя миниатюра (`leaflet_thumbs`, отдаёт
 * route `/grocery/img/…`), ссылки на страницу буклета нет. Один и тот же товар с теми же ценами и сроком на разных страницах — одна акция.
 */
export function siteOffers(rows: LeafletRow[]): SiteOffer[] {
  const out = new Map<string, SiteOffer>();
  for (const r of rows) {
    if (r.price === null && r.discount_percent === null) continue;
    const card = r.price !== null && r.price_card !== null;
    const price = card ? r.price_card : r.price;
    const unit = price !== null ? unitPrice(price, r.packaging) : null;
    // «2. precei»: цена акции за один товар, цена второго уходит в условие (это условие, а не скидка).
    const condition = r.price_second !== null ? `${r.condition ?? "2. prece"}: ${String(r.price_second).replace(".", ",")} €` : card && !r.condition?.includes("Lidl Plus") ? [r.condition, "Lidl Plus"].filter(Boolean).join(", ") : r.condition;
    const offer: SiteOffer = {
      external_id: r.external_id,
      title: r.title,
      brand: r.brand,
      packaging: r.packaging,
      price,
      old_price: card ? r.price : r.old_price,
      discount_percent: card ? null : r.discount_percent,
      unit_price: unit?.unitPrice ?? null,
      unit: unit?.unit ?? null,
      condition,
      starts_at: r.starts_at,
      ends_at: r.ends_at,
      url: null, // ссылка на страницу буклета не нужна: клик по карточке никуда не ведёт
      image_url: r.photo_box ? `/grocery/img/${r.source_id}/${r.external_id}` : null,
    };
    const key = [r.title.toLowerCase(), r.packaging, price, offer.old_price, offer.discount_percent, r.starts_at, r.ends_at].join("|");
    if (!out.has(key)) out.set(key, offer);
  }
  return [...out.values()];
}

const day = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Riga" }).format(new Date(iso));
const dm = (iso: string) => new Intl.DateTimeFormat("ru", { day: "2-digit", month: "2-digit", timeZone: "Europe/Riga" }).format(new Date(iso));

/** «до 28.10», «с 29.10» или «27.10–29.10», если срок плитки отличается от срока буклета; совпал — null. Дни по Риге. */
export function ownPeriod(row: Pick<LeafletRow, "starts_at" | "ends_at">, flyer: { starts_at: string; ends_at: string }): string | null {
  const early = day(row.starts_at) === day(flyer.starts_at);
  const late = day(row.ends_at) === day(flyer.ends_at);
  if (early && late) return null;
  if (early) return `до ${dm(row.ends_at)}`;
  if (late) return `с ${dm(row.starts_at)}`;
  return `${dm(row.starts_at)}–${dm(row.ends_at)}`;
}
