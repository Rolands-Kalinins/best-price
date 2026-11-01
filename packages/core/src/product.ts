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
  })
  // Как в offerSchema: старая цена не выше текущей — ошибка разбора, товар остаётся без неё.
  .transform((p) => (p.oldPrice !== null && p.oldPrice <= p.price ? { ...p, oldPrice: null } : p));

export type Product = z.infer<typeof productSchema>;

// Постраничный обход может отдать один товар дважды, а два одинаковых ключа в одном upsert роняют весь запуск.
export function uniqueProducts(products: Product[]): Product[] {
  const seen = new Set<string>();
  return products.filter((p) => !seen.has(p.externalId) && seen.add(p.externalId));
}

export type ProductScrapeResult = { products: Product[]; invalid: number };
