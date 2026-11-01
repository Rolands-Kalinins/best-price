import { mkdir, writeFile } from "node:fs/promises";
import { type Product, type ProductScrapeResult, productSchema, uniqueProducts } from "@bestprice/core";

// Apotheka (apotheka.lv): Magento с React-интерфейсом, серверный рендер. Разведка 2026-11-01 (docs/recon/apotheka.md).
// 1) Список /produkti?p=N (34 товара на страницу, ≈180 страниц, ≈6 175 товаров) отдаёт товары встроенным JSON: цена, <del> старая цена,
//    цена для зарегистрированных, бренд, категория, наличие. Штрихкода нет. /catalog/ajax/ закрыт в robots.txt, им не пользуемся.
// 2) В sitemap ещё ≈2 960 товаров, которых нет в списках: рецептурные и не в наличии. Их читаем по карточкам (ld+json: цена, gtin, тип Drug)
//    и оставляем только в наличии (решение владельца, как у Benu).
const SHOP = "https://www.apotheka.lv";
const LIST = `${SHOP}/produkti`;
const SITEMAP = `${SHOP}/sitemap_lv.xml`;
const USER_AGENT = "BestPriceBot (personal project)";
const MAX_INVALID = 0.05;
const CARD = "Reģistrētiem lietotājiem";
// В списке + карточках ≈7 500 товаров; оборванный обход выглядел бы успехом, поэтому порог.
const MIN_PRODUCTS = 5000;

type Item = Record<string, any>;

const num = (s: string) => Number.parseFloat(s.replace(/[^\d,.]/g, "").replace(",", "."));
// «šampūni, putas matiem» → «sampuni/putas-matiem»: слаги без диакритики, по ним categorize ищет основы.
const slug = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

function fromList(i: Item): unknown {
  const html = String(i.price ?? "");
  // Старая цена только из <del>: поле priceOld есть у всех и бывает равно текущей или даже ниже (у обычных товаров).
  const del = html.match(/<del[^>]*>([^<]*)<\/del>/);
  // Цена для зарегистрированных: второй блок цены с иконкой лояльности, в нём последнее <data value>; price (priceSimple) остаётся обычной.
  const card = /reģistr/i.test(html) ? [...html.matchAll(/<data value="([\d.]+)"/g)].at(-1)?.[1] : undefined;
  const category = text(i.itemCategory)
    ?.split(",")
    .map(slug)
    .filter(Boolean)
    .join("/");
  return {
    externalId: String(i.sku ?? ""),
    title: String(i.name ?? "").trim(),
    brand: text(i.brand), // false у товаров без бренда
    packaging: null, // размер только в названии, его разбирает матчер
    price: i.priceSimple,
    oldPrice: del ? num(del[1]) : null,
    startsAt: null, // срока скидок в данных нет
    endsAt: null,
    cardPrice: card ? Number(card) : null,
    cardCondition: card ? CARD : null,
    cardStartsAt: null,
    cardEndsAt: null,
    ean: null, // штрихкод только в карточке
    url: i.url,
    imageUrl: i.image?.image_url ?? null,
    category: category || null,
    prescription: false, // рецептурных в списках нет; isMedicine — ОТС и гомеопатия
    inStock: i.actions?.isSalable === true,
  };
}

export function parseList(items: unknown[]): ProductScrapeResult {
  const products: Product[] = [];
  let invalid = 0;
  for (const i of items as Item[]) {
    try {
      const parsed = productSchema.safeParse(fromList(i));
      if (parsed.success) products.push(parsed.data);
      else invalid++;
    } catch {
      invalid++;
    }
  }
  return { products: uniqueProducts(products), invalid };
}

/** Товар из карточки (ld+json в @graph). null: товара в разметке нет или он не разобрался. */
export function parseCard(html: string): Product | null {
  for (const m of html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    let json: Item;
    try {
      json = JSON.parse(m[1]);
    } catch {
      continue;
    }
    const node = ((json["@graph"] ?? [json]) as Item[]).find((n) => [n?.["@type"]].flat().includes("Product"));
    if (!node) continue;
    const offer = [node.offers].flat()[0] ?? {};
    const gtin = String(node.gtin ?? node.gtin13 ?? "");
    const image = [node.image].flat()[0];
    const parsed = productSchema.safeParse({
      externalId: String(node.sku ?? ""),
      title: String(node.name ?? "").trim(),
      brand: text(node.brand?.name),
      packaging: null,
      price: offer.price,
      oldPrice: null,
      startsAt: null,
      endsAt: null,
      ean: /^\d{8,14}$/.test(gtin) ? gtin : null,
      url: node.url,
      // У рецептурных вместо фото общая заглушка с водяным знаком.
      imageUrl: typeof image === "string" && !image.includes("/placeholder/") ? image : null,
      category: null,
      prescription: [node["@type"]].flat().includes("Drug"),
      inStock: String(offer.availability).endsWith("InStock"),
    });
    return parsed.success ? parsed.data : null;
  }
  return null;
}

/** Адреса товаров из sitemap (…-pmm0010015lv); остальное там страницы разделов и статьи. */
export function productUrls(xml: string): string[] {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]).filter((u) => /-pmm\d+lv$/i.test(u));
}

const ATTEMPTS = 4;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Повторяем сетевые ошибки, 5xx и 429; остальные 4xx повтор не лечит (findings/maxima-fetch-no-retry). gone: 404 вернуть null (карточку убрали).
async function get(url: string, retryMs: number, gone = false): Promise<string | null> {
  for (let attempt = 1; ; attempt++) {
    let failure: unknown;
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(60_000) });
      if (res.ok) return await res.text();
      if (gone && (res.status === 404 || res.status === 410)) return null;
      failure = new Error(`Apotheka: HTTP ${res.status}`);
      if (res.status < 500 && res.status !== 429) throw failure;
    } catch (e) {
      if (e === failure) throw e;
      failure = e;
    }
    if (attempt === ATTEMPTS) throw failure;
    await wait(retryMs * attempt);
  }
}

function listPage(html: string): { products: Item[]; last: number; count: number } {
  for (const m of html.matchAll(/<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)) {
    if (m[1].length < 1000) continue;
    try {
      const j = JSON.parse(m[1]);
      if (Array.isArray(j.products) && Number.isInteger(j.paginationConfig?.lastPage)) {
        return { products: j.products, last: j.paginationConfig.lastPage, count: Number(html.match(/"productsCount":(\d+)/)?.[1] ?? 0) };
      }
    } catch {
      /* другой блок JSON */
    }
  }
  throw new Error("Apotheka: неожиданный формат страницы списка, вёрстка могла измениться");
}

const key = (u: string) => u.match(/pmm\d+lv$/i)?.[0].toLowerCase() ?? u;

export async function scrape(opts: { retryMs?: number; pauseMs?: number; minProducts?: number } = {}): Promise<ProductScrapeResult> {
  const retryMs = opts.retryMs ?? 5000;
  const pauseMs = opts.pauseMs ?? 500;

  const items = new Map<string, Item>();
  let last = 1;
  let count = 0;
  for (let p = 1; p <= last; p++) {
    const html = (await get(`${LIST}?p=${p}`, retryMs))!;
    const page = listPage(html);
    last = page.last;
    count = page.count;
    for (const i of page.products) items.set(String(i.sku), i);
    if (p === 1) {
      // Сырая первая страница в debug/: workflow выгружает её артефактом при сбое (FR-30).
      await mkdir("debug", { recursive: true });
      await writeFile("debug/apotheka-page1.html", html);
    }
    await wait(pauseMs);
  }
  // Счётчик на странице сошёлся с обходом при разведке; если страницы урезали, молча потеряли бы часть (findings/maxima-limit-ceiling).
  if (items.size < count * 0.99) throw new Error(`Apotheka: получено ${items.size} из ${count}, пагинация могла измениться`);

  const result = parseList([...items.values()]);
  const listed = new Set([...items.values()].map((i) => key(String(i.url))));
  const cards = productUrls((await get(SITEMAP, retryMs))!).filter((u) => !listed.has(key(u)));
  const extra: Product[] = [];
  for (const url of cards) {
    const html = await get(url, retryMs, true);
    await wait(pauseMs);
    if (html === null) continue;
    const card = parseCard(html);
    if (!card) result.invalid++;
    // Не в наличии не берём (решение владельца): карточку приходится читать, чтобы это узнать.
    else if (card.inStock) extra.push(card);
  }

  const products = uniqueProducts([...result.products, ...extra]);
  const seen = products.length + result.invalid;
  if (result.invalid > seen * MAX_INVALID) {
    throw new Error(`Apotheka: не разобрано ${result.invalid} из ${seen} товаров, формат мог измениться`);
  }
  const min = opts.minProducts ?? MIN_PRODUCTS;
  if (products.length < min) throw new Error(`Apotheka: всего ${products.length} товаров, ожидалось от ${min}`);
  return { products, invalid: result.invalid };
}
