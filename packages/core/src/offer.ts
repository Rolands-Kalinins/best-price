import { z } from "zod";

// Общий контракт парсера (FR-19): все магазины отдают акции в этом формате.
export const offerSchema = z.object({
  externalId: z.string().min(1),
  title: z.string().min(1),
  brand: z.string().nullable(),
  packaging: z.string().nullable(),
  // null только у скидки на бренд или категорию («−30% на MILKA»): конкретной цены у неё нет.
  price: z.number().positive().nullable(),
  oldPrice: z.number().positive().nullable(),
  discountPercent: z.number().int().min(1).max(100).nullable().default(null),
  unitPrice: z.number().positive().nullable(),
  unit: z.enum(["kg", "l"]).nullable(),
  condition: z.string().nullable(),
  startsAt: z.iso.datetime().nullable(),
  endsAt: z.iso.datetime().nullable(),
  ean: z.string().nullable(),
  url: z.url(),
  imageUrl: z.url().nullable(),
  category: z.string().nullable(),
})
  .refine((o) => o.price !== null || o.discountPercent !== null, "нужна цена или процент скидки")
  // Старая цена не выше новой (ошибка разбора или нет скидки): зачёркнутая цена ниже текущей выглядела бы нелепо. Акцию оставляем, цену убираем.
  .transform((o) => (o.price !== null && o.oldPrice !== null && o.oldPrice <= o.price ? { ...o, oldPrice: null } : o));

export type Offer = z.infer<typeof offerSchema>;

// Магазин может отдать один товар дважды (постраничный обход, блоки на странице). Два одинаковых ключа в одном upsert роняют весь запуск.
export function uniqueOffers(offers: Offer[]): Offer[] {
  const seen = new Set<string>();
  return offers.filter((o) => !seen.has(o.externalId) && seen.add(o.externalId));
}

// Результат запуска: валидные акции и число отброшенных записей (FR-29).
export type ScrapeResult = { offers: Offer[]; invalid: number };

const TO_BASE = { kg: ["kg", 1], g: ["kg", 0.001], l: ["l", 1], ml: ["l", 0.001] } as const;

// Цена за кг или л по фасовке: «150 g», «1 l», «8 x 125 g», «gab. 250 g» (FR-24).
// Штучные товары («10 gab.») и нераспознанный текст дают null: товар от этого не ломается.
export function unitPrice(
  price: number,
  packaging: string | null,
): { unitPrice: number; unit: "kg" | "l" } | null {
  const m = packaging?.match(/(?:(\d+)\s*x\s*)?(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l)\b/i);
  if (!m) return null;
  const [unit, factor] = TO_BASE[m[3].toLowerCase() as keyof typeof TO_BASE];
  const amount = Number(m[1] ?? 1) * Number(m[2].replace(",", ".")) * factor;
  return amount > 0 ? { unitPrice: Math.round((price / amount) * 100) / 100, unit } : null;
}
