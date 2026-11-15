import { mkdir, writeFile } from "node:fs/promises";
import { type Product, type ProductScrapeResult, productSchema, rigaIso, uniqueProducts, fetchRetry } from "@bestprice/core";

const ORIGIN = "https://www.euroaptieka.lv";
// Страницы списков (/l/...) рисует браузер (в HTML заглушки), /api/* закрыт (403), поэтому берём карточки товаров из sitemap:
// в каждой есть ld+json с артикулом, ценой, штрихкодом, брендом и путём категории (проверено 2026-11-01).
// robots.txt закрывает только корзину, вход, оплату и поиск; sitemap и /p/ открыты. Карточка ≈140 КБ со сжатием, ≈0,5 с.
const SITEMAP = `${ORIGIN}/sitemap/products.xml`;
// Раздел акций: его плитки (рисуются на сервере, ≈3 МБ) показывают цену по клубной карте, её в карточке нет.
const AKCIJAS = `${ORIGIN}/l/akcijas`;
const MAX_INVALID = 0.05;
// В sitemap 6 608 латышских адресов; оборванный обход выглядел бы успехом, поэтому порог.
const MIN_PRODUCTS = 6000;

// Адреса товаров без русских дублей (/ru/p/...): они повторяют те же товары.
export function parseSitemap(xml: string): string[] {
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).filter((u) => u.startsWith(`${ORIGIN}/p/`));
  return [...new Set(urls)];
}

type Ld = {
  "@type": string;
  sku?: string;
  name?: string;
  url?: string;
  image?: string | string[];
  gtin13?: string;
  brand?: { name?: string };
  offers?: { price?: number; availability?: string };
  itemListElement?: { item?: string }[];
};

// Next.js кладёт ld+json в скрипт self.__next_s.push([0, {type, children: "<json строкой>", id}]).
const SCRIPT = /\.push\(\[0,(\{"type":"application\/ld\+json"[\s\S]*?\})\]\)<\/script>/g;
function cardLd(html: string): Ld[] {
  for (const m of html.matchAll(SCRIPT)) {
    const o = JSON.parse(m[1]);
    if (o.id === "product-schema") return JSON.parse(o.children);
  }
  throw new Error("нет данных товара");
}

// Путь категории из последней хлебной крошки: «.../p/bezrecepsu-medikamenti/sapes/galvassapes» → «bezrecepsu-medikamenti/sapes/galvassapes».
function category(ld: Ld[]): string | null {
  const last = ld.find((x) => x["@type"] === "BreadcrumbList")?.itemListElement?.at(-1)?.item;
  return last?.match(/\/p\/(.+)$/)?.[1] ?? null;
}

function toProduct(html: string): unknown {
  const ld = cardLd(html);
  const p = ld.find((x) => x["@type"] === "Product");
  if (!p) throw new Error("нет Product");
  const cents = p.offers?.price;
  return {
    externalId: String(p.sku ?? ""),
    title: (p.name ?? "").trim(),
    brand: p.brand?.name || null,
    packaging: null, // размер только в названии, его разбирает матчер
    price: typeof cents === "number" ? Math.round(cents) / 100 : null, // в данных центы: 249 = 2,49 €
    oldPrice: null, // цена по клубной карте (−52%) зависит от условий; в карточке лежит обычная
    startsAt: null,
    endsAt: null,
    ean: p.gtin13 || null,
    url: p.url,
    imageUrl: (Array.isArray(p.image) ? p.image[0] : p.image) || null,
    category: category(ld),
    // ponytail: рецептурных на сайте не видели (раздел «Bezrecepšu medikamenti»); если появится признак в карточке, ставить его.
    prescription: false,
    inStock: p.offers?.availability?.endsWith("InStock") === true,
  };
}

// null: карточка не разобрана (нет данных, битая цена).
function parseOne(html: string): Product | null {
  try {
    const parsed = productSchema.safeParse(toProduct(html));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function parse(htmls: string[]): ProductScrapeResult {
  const products: Product[] = [];
  let invalid = 0;
  for (const h of htmls) {
    const p = parseOne(h);
    if (p) products.push(p);
    else invalid++;
  }
  return { products: uniqueProducts(products), invalid };
}

export type CardPrice = Pick<Product, "cardPrice" | "cardCondition" | "cardStartsAt" | "cardEndsAt">;

// Плитки /l/akcijas с клубной скидкой («Lojalitātes kluba biedru atlaide»): артикул → цена по карте, условие и срок.
// Артикул плитки (data-rec-product) совпадает с sku карточки. Плитки без классов newProductPrice--conditional (обычные товары карусели) пропускаем.
export function parseCardPrices(html: string): Map<string, CardPrice> {
  const out = new Map<string, CardPrice>();
  for (const tile of html.split('<a class="evLink productCard').slice(1)) {
    if (!tile.includes("newProductPrice--conditional")) continue;
    const id = tile.match(/data-rec-product="(\d+)"/)?.[1];
    const price = Number((tile.match(/class="newProductPrice[^"]*"><span>([^<]*)</)?.[1] ?? "").replace(/[^\d,]/g, "").replace(",", "."));
    if (!id || !(price > 0)) continue;
    const cond = tile.match(/class="discountDescriptionWithTooltip">([^<]*)</)?.[1]?.trim().replace(/\.$/, "");
    // «Piedāvājums spēkā 31.10.-30.11.2026.»: год один, у начала он прошлый, если акция идёт через Новый год.
    const d = tile.match(/spēkā (\d{2})\.(\d{2})\.-(\d{2})\.(\d{2})\.(\d{4})/);
    const year = d ? +d[5] : 0;
    out.set(id, {
      cardPrice: price,
      cardCondition: ["Lojalitātes klubs", cond].filter(Boolean).join(" · "),
      cardStartsAt: d ? rigaIso(+d[2] > +d[4] ? year - 1 : year, +d[2], +d[1], 0, 0, 0) : null,
      cardEndsAt: d ? rigaIso(year, +d[4], +d[3], 23, 59, 59) : null,
    });
  }
  return out;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// null: 404 (товар убрали после выхода sitemap). Повторяем сетевые ошибки, 5xx и 429 (findings/maxima-fetch-no-retry).
// Остальные 4xx, в том числе 403, сразу ошибка: сайт блокирует запросы, обходить защиту не будем (решение владельца).
const get = (url: string, retryMs: number) => fetchRetry(url, { name: "Euroaptieka", read: (t) => t, retryMs, gone: [404] });

export async function scrape(opts: { retryMs?: number; pauseMs?: number; concurrency?: number; minProducts?: number } = {}): Promise<ProductScrapeResult> {
  const retryMs = opts.retryMs ?? 3000;
  const sitemap = await get(SITEMAP, retryMs);
  const urls = sitemap ? parseSitemap(sitemap) : [];
  if (!urls.length) throw new Error("Euroaptieka: в sitemap нет адресов товаров, формат мог измениться");

  // HTML карточки ≈850 КБ, 6 600 штук в памяти не держим: разбираем сразу по приходу.
  const products: Product[] = [];
  let invalid = 0;
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (!failed && next < urls.length) {
      const i = next++;
      try {
        const html = await get(urls[i], retryMs);
        if (i === 0 && html) {
          // Сырая первая карточка в debug/: workflow выгружает её артефактом при сбое (FR-30).
          await mkdir("debug", { recursive: true });
          await writeFile("debug/euroaptieka-first.html", html);
        }
        const p = html ? parseOne(html) : null;
        if (p) products.push(p);
        else invalid++;
      } catch (e) {
        failed = true;
        throw e;
      }
      if ((i + 1) % 500 === 0) console.log(`Euroaptieka: ${i + 1} из ${urls.length}`);
      await wait(opts.pauseMs ?? 250);
    }
  };
  await Promise.all(Array.from({ length: opts.concurrency ?? 3 }, worker));

  const result = { products: uniqueProducts(products), invalid };
  if (invalid > urls.length * MAX_INVALID) {
    throw new Error(`Euroaptieka: не разобрано ${invalid} из ${urls.length} карточек, формат мог измениться`);
  }
  const min = opts.minProducts ?? MIN_PRODUCTS;
  if (result.products.length < min) throw new Error(`Euroaptieka: всего ${result.products.length} товаров, ожидалось от ${min}`);

  // Цена по клубной карте. Пустой результат — смена разметки (в разделе всегда сотни клубных скидок), а не повод молча потерять цены.
  const html = await get(AKCIJAS, retryMs);
  const cards = html ? parseCardPrices(html) : new Map<string, CardPrice>();
  if (!cards.size) throw new Error("Euroaptieka: в /l/akcijas нет клубных плиток, формат мог измениться");
  // Повторная проверка схемой: цена по карте не ниже обычной отбрасывается.
  result.products = result.products.map((p) => {
    const c = cards.get(p.externalId);
    const r = c ? productSchema.safeParse({ ...p, ...c }) : null;
    return r?.success ? r.data : p;
  });
  return result;
}
