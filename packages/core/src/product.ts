import { z } from "zod";

// Контракт парсера разделов «аптеки» и «косметика»: весь каталог, а не только акции (docs/recon/README.md).
export const productSchema = z
  .object({
    externalId: z.string().min(1),
    title: z.string().min(1),
    brand: z.string().nullable(),
    packaging: z.string().nullable(),
    price: z.number().positive(),
    oldPrice: z.number().positive().nullable(),
    startsAt: z.iso.datetime().nullable(),
    endsAt: z.iso.datetime().nullable(),
    ean: z.string().nullable(),
    url: z.url(),
    imageUrl: z.url().nullable(),
    category: z.string().nullable(), // путь категории так, как его отдаёт магазин
    prescription: z.boolean(), // рецептурный препарат: помечаем, а не отбрасываем
    inStock: z.boolean(),
    // Цена только для владельцев карты магазина (клуб Euroaptieka, «Veselība» Mēness) и её условие/срок. price остаётся ценой для всех.
    cardPrice: z.number().positive().nullable().default(null),
    cardCondition: z.string().nullable().default(null), // например «Iepērkoties vismaz 9 EUR vērtībā»
    cardStartsAt: z.iso.datetime().nullable().default(null),
    cardEndsAt: z.iso.datetime().nullable().default(null),
  })
  // Как в offerSchema: старая цена не выше текущей — ошибка разбора, товар остаётся без неё. То же для цены по карте: не ниже обычной она не нужна.
  .transform((p) => {
    const q = p.oldPrice !== null && p.oldPrice <= p.price ? { ...p, oldPrice: null } : p;
    return q.cardPrice !== null && q.cardPrice >= q.price ? { ...q, cardPrice: null, cardCondition: null, cardStartsAt: null, cardEndsAt: null } : q;
  });

export type Product = z.infer<typeof productSchema>;

// Постраничный обход может отдать один товар дважды, а два одинаковых ключа в одном upsert роняют весь запуск.
export function uniqueProducts(products: Product[]): Product[] {
  const seen = new Set<string>();
  return products.filter((p) => !seen.has(p.externalId) && seen.add(p.externalId));
}

export type ProductScrapeResult = { products: Product[]; invalid: number };
