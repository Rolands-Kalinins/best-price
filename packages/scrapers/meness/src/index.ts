import { mkdir, writeFile } from "node:fs/promises";
import { type Product, type ProductScrapeResult, productSchema, rigaIso, uniqueProducts } from "@bestprice/core";

const SHOP = "https://e-menessaptieka.lv";
// Открытый JSON-API магазина, тот же запрос, что делает сайт. Без cookies, голым fetch (проверено 2026-11-01).
// itemsPerPage=100 проходит, 300 даёт 500. Страница ≈3.7 МБ (в каждом товаре HTML-описания категорий), весь каталог ≈103 страницы.
// robots.txt закрывает только /upload/*.
const API = "https://api.e-menessaptieka.lv/api/v2/shop/search/products";
const IMAGES = "https://api.e-menessaptieka.lv/media/image/";
const PER_PAGE = 100;
const USER_AGENT = "BestPriceBot (personal project)";
const MAX_INVALID = 0.05;
const CARD = "Ar karti «Veselība»";
// Каталог ≈10 200 товаров; оборванный обход выглядел бы успехом, поэтому порог.
const MIN_PRODUCTS = 9000;
// Верхний уровень меню сайта. В productTaxons лежат ещё деревья Moonmart (moonmart-lv, mv-…), «-1» и пр.: они меню магазина не являются.
const MENU = new Set([
  "analizu-kompleksi", "vitamini-un-mineralvielas", "medikamenti", "skaistumam",
  "mutes-dobuma-higiena", "medicinas-preces", "maminam-un-berniem", "viss-celojumiem",
]);

type Attr = { value?: unknown; attribute?: { code?: string } };
type Item = {
  code: string;
  name: string;
  slug: string;
  enabled?: boolean;
  productTaxons?: { slug: string }[];
  images?: { path: string }[];
  attributeValues?: Attr[];
  defaultVariant?: {
    barcode?: string | null;
    inStock?: boolean;
    prices?: {
      price: number;
      originalPrices?: number[];
      startsAt?: string | null;
      endsAt?: string | null;
      loyaltyCatalogPromotionPrice?: number | null;
      loyaltyCatalogPromotionStartsAt?: string | null;
      loyaltyCatalogPromotionEndsAt?: string | null;
    };
  };
};

const attr = (it: Item, code: string) => it.attributeValues?.find((a) => a.attribute?.code === code)?.value;
const euro = (cents: number) => Math.round(cents) / 100;

// «2026-10-01 00:00:00» — время по Риге без пояса.
function riga(s: string | null | undefined): string | null {
  const m = s?.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  return m ? rigaIso(+m[1], +m[2], +m[3], +m[4], +m[5], +m[6]) : null;
}

// Служебные деревья: общий корень, Moonmart (moonmart*, mv-*, *-mv), подборки. Категориями не считаем.
const SERVICE = /^(menessaptieka$|moonmart|mv-|kosmetika-mv|labas-cenas|1-1$|testi$)/;

// Самый глубокий путь, при равенстве первый. Сначала из меню магазина; у ≈10% товаров (гигиена, зоотовары) там ничего нет —
// тогда из остальных неслужебных деревьев (higienas-preces, preces-majdzivniekiem…).
function category(it: Item): string | null {
  const deepest = (ok: (top: string) => boolean) => {
    let best: string | null = null;
    let depth = 0;
    for (const { slug } of it.productTaxons ?? []) {
      const d = slug.split("/").length;
      if (ok(slug.split("/")[0]) && d > depth) {
        best = slug;
        depth = d;
      }
    }
    return best;
  };
  return deepest((top) => MENU.has(top)) ?? deepest((top) => !SERVICE.test(top));
}

function toProduct(it: Item): unknown {
  const v = it.defaultVariant;
  const pr = v?.prices;
  const old = pr?.originalPrices?.[0];
  const brand = attr(it, "brand");
  return {
    externalId: String(it.code),
    title: it.name.trim(),
    brand: typeof brand === "string" && brand ? brand : null,
    packaging: null, // размер только в названии, его разбирает матчер
    price: pr ? euro(pr.price) : null,
    oldPrice: old ? euro(old) : null,
    startsAt: old ? riga(pr?.startsAt) : null,
    endsAt: old ? riga(pr?.endsAt) : null,
    // Цена по карте лояльности «Veselība» (у ≈15% товаров), со своим периодом.
    cardPrice: pr?.loyaltyCatalogPromotionPrice ? euro(pr.loyaltyCatalogPromotionPrice) : null,
    cardCondition: pr?.loyaltyCatalogPromotionPrice ? CARD : null,
    cardStartsAt: pr?.loyaltyCatalogPromotionPrice ? riga(pr.loyaltyCatalogPromotionStartsAt) : null,
    cardEndsAt: pr?.loyaltyCatalogPromotionPrice ? riga(pr.loyaltyCatalogPromotionEndsAt) : null,
    ean: v?.barcode || null, // в выборке 2026-11-01 пусто у всех
    url: `${SHOP}/p/${it.slug}-${it.code}`,
    imageUrl: it.images?.[0] ? IMAGES + it.images[0].path : null,
    category: category(it),
    prescription: attr(it, "receipt") === true,
    inStock: v?.inStock === true,
  };
}

export function parse(items: unknown[]): ProductScrapeResult {
  const products: Product[] = [];
  let invalid = 0;
  for (const it of items as Item[]) {
    if (it.enabled === false) continue;
    try {
      const parsed = productSchema.safeParse(toProduct(it));
      if (parsed.success) products.push(parsed.data);
      else invalid++;
    } catch {
      invalid++;
    }
  }
  return { products: uniqueProducts(products), invalid };
}

const ATTEMPTS = 3;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Повторяем сетевые ошибки, 5xx и 429; остальные 4xx повтор не лечит (findings/maxima-fetch-no-retry).
async function get(url: string, retryMs: number): Promise<{ meta?: { totalItems?: unknown; lastPage?: unknown }; data?: unknown }> {
  for (let attempt = 1; ; attempt++) {
    let failure: unknown;
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(60_000) });
      if (res.ok) return await res.json();
      failure = new Error(`Mēness: HTTP ${res.status}`);
      if (res.status < 500 && res.status !== 429) throw failure;
    } catch (e) {
      if (e === failure) throw e;
      failure = e;
    }
    if (attempt === ATTEMPTS) throw failure;
    await wait(retryMs * attempt);
  }
}

// Поиск отдаёт не больше 10 000 результатов (Elasticsearch: from + size <= 10000, иначе HTTP 400), а в каталоге 10 221 товар.
// Поэтому обходим по ценовым диапазонам в центах (price[min], price[max], границы включены, повтор на стыке убирает uniqueProducts): в каждом меньше 10 000.
// ponytail: пять диапазонов вручную; если в один попадёт больше 10 000 товаров, проверка полноты ниже упадёт, и диапазон надо будет разбить.
const BANDS: [number, number][] = [[0, 500], [500, 1000], [1000, 2000], [2000, 5000], [5000, 10_000_000]];

type Body = Awaited<ReturnType<typeof get>>;
function checked(body: Body): { data: unknown[]; last: number; total: number } {
  const meta = body.meta;
  if (!Array.isArray(body.data) || !Number.isInteger(meta?.lastPage) || !Number.isInteger(meta?.totalItems)) {
    throw new Error("Mēness: неожиданный ответ, формат мог измениться");
  }
  return { data: body.data, last: meta!.lastPage as number, total: meta!.totalItems as number };
}

export async function scrape(opts: { retryMs?: number; pauseMs?: number; minProducts?: number; bands?: [number, number][] } = {}): Promise<ProductScrapeResult> {
  const retryMs = opts.retryMs ?? 3000;
  // Общий счётчик каталога без фильтров: по нему проверяем, что диапазоны покрыли всё.
  const { total } = checked(await get(`${API}?itemsPerPage=1`, retryMs));
  const items: unknown[] = [];
  for (const [min, max] of opts.bands ?? BANDS) {
    const got: unknown[] = [];
    let bandTotal = 0;
    for (let p = 1, last = 1; p <= last; p++) {
      const body = checked(await get(`${API}?itemsPerPage=${PER_PAGE}&page=${p}&price[min]=${min}&price[max]=${max}`, retryMs));
      last = body.last;
      bandTotal = body.total;
      got.push(...body.data);
      if (!items.length && p === 1) {
        // Сырая первая страница в debug/: workflow выгружает её артефактом при сбое (FR-30). Все страницы весят ≈390 МБ, их не храним.
        await mkdir("debug", { recursive: true });
        await writeFile("debug/meness-page1.json", JSON.stringify(body));
      }
      await wait(opts.pauseMs ?? 400);
    }
    // Если сервер урезал страницы, молча потеряли бы часть товаров (findings/maxima-limit-ceiling). 1% запаса: каталог меняется во время обхода.
    if (got.length < bandTotal * 0.99) throw new Error(`Mēness: диапазон ${min}–${max}: получено ${got.length} из ${bandTotal}, пагинация могла измениться`);
    items.push(...got);
  }
  const result = parse(items);
  const seen = result.products.length + result.invalid;
  if (seen < total * 0.99) {
    throw new Error(`Mēness: собрано ${seen} из ${total} товаров, диапазоны цен могли не покрыть каталог`);
  }
  if (result.invalid > seen * MAX_INVALID) {
    throw new Error(`Mēness: не разобрано ${result.invalid} из ${seen} товаров, формат мог измениться`);
  }
  const min = opts.minProducts ?? MIN_PRODUCTS;
  if (result.products.length < min) {
    throw new Error(`Mēness: всего ${result.products.length} товаров, ожидалось от ${min}`);
  }
  return result;
}
