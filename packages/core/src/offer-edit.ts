// Правка акции админом (страница /grocery/admin/offers): проверка полей формы и список закреплённых полей.
// Закреплённое (offers.locked_fields) парсер при следующем запуске не перезаписывает: это делает триггер в базе (миграция offer_edits).
import { unitPrice } from "./offer";
import { safeHttpUrl } from "./offer-view";
import { rigaIso } from "./riga";

export type EditableOffer = {
  title: string; brand: string | null; packaging: string | null; condition: string | null; price: number | null; old_price: number | null;
  discount_percent: number | null; ends_at: string | null; image_url: string | null; locked_fields: string[];
};
export type OfferPatch = Omit<EditableOffer, "locked_fields"> & { unit_price: number | null; unit: string | null };
export type OfferEdit = { ok: true; patch: OfferPatch; locked: string[] } | { ok: false; error: string };

const MAX_PRICE = 10_000;
const text = (s: string | undefined) => s?.trim().slice(0, 200) || null;
const same = (a: unknown, b: unknown) => a === b || (typeof a === "string" && typeof b === "string" && new Date(a).getTime() === new Date(b).getTime());
const riga = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Riga" }).format(new Date(iso));

/** Поля формы (строки) → значения для update и полный список закреплённых полей (прежние + изменённые). Цену за кг/л считаем заново. */
export function parseOfferEdit(f: Record<string, string | undefined>, cur: EditableOffer): OfferEdit {
  const title = text(f.title);
  if (!title) return { ok: false, error: "Название не может быть пустым" };
  const money = (s: string | undefined): number | null | "bad" => {
    const t = s?.trim().replace(",", ".");
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) && n > 0 && n <= MAX_PRICE ? Math.round(n * 100) / 100 : "bad";
  };
  const price = money(f.price);
  const oldPrice = money(f.old_price);
  if (price === "bad" || oldPrice === "bad") return { ok: false, error: `Цена должна быть числом от 0,01 до ${MAX_PRICE}` };
  if (price !== null && oldPrice !== null && oldPrice <= price) return { ok: false, error: "«Было» должно быть больше цены" };
  const pctText = f.discount_percent?.trim();
  const pct = pctText ? Number(pctText) : null;
  if (pct !== null && !(Number.isInteger(pct) && pct >= 1 && pct <= 100)) return { ok: false, error: "Скидка — целое число от 1 до 100" };
  if (price === null && pct === null) return { ok: false, error: "Нужна цена или процент скидки" };
  const imageText = f.image_url?.trim();
  const image = imageText ? safeHttpUrl(imageText) : null;
  if (imageText && !image) return { ok: false, error: "Ссылка на картинку должна начинаться с http:// или https://" };

  let endsAt = cur.ends_at;
  const day = f.ends_at?.trim();
  if (!day) endsAt = null;
  else {
    const m = day.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return { ok: false, error: "Дата в формате ГГГГ-ММ-ДД" };
    if (!cur.ends_at || riga(cur.ends_at) !== day) endsAt = rigaIso(+m[1], +m[2], +m[3], 23, 59, 59);
  }

  const packaging = text(f.packaging);
  const unit = price !== null ? unitPrice(price, packaging) : null;
  const patch: OfferPatch = {
    title, brand: text(f.brand), packaging, condition: text(f.condition), price, old_price: oldPrice, discount_percent: pct, ends_at: endsAt, image_url: image,
    unit_price: unit?.unitPrice ?? null, unit: unit?.unit ?? null,
  };
  const changed = (Object.keys(patch) as (keyof OfferPatch)[]).filter((k) => k !== "unit_price" && k !== "unit" && !same(patch[k], (cur as Record<string, unknown>)[k]));
  // Цена за кг/л производная от цены и объёма: закрепляем вместе с ними, иначе парсер подсунул бы цену за кг от старой цены.
  if (changed.includes("price") || changed.includes("packaging")) changed.push("unit_price", "unit");
  return { ok: true, patch, locked: [...new Set([...cur.locked_fields, ...changed])] };
}
