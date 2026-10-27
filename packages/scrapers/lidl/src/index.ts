import { mkdir, writeFile } from "node:fs/promises";
import { type Offer, type ScrapeResult, offerSchema, uniqueOffers, unitPrice } from "@bestprice/core";

const ORIGIN = "https://www.lidl.lv";
// JSON-индекс, из которого сайт сам подгружает плитки («Ielādēt vairāk»). Весь индекс = акционные товары.
// /robots.txt закрывает только /q/search?id=* и пути с цифр, /q/api/search не упомянут (проверено 2026-10-25).
const API = `${ORIGIN}/q/api/search?locale=lv_LV&assortment=LV&version=2.1.0`;
// Сервер отдаёт максимум 60 за запрос, больше просить бесполезно.
const PAGE_SIZE = 60;
const USER_AGENT = "BestPriceBot (personal project)";

type Price = {
  price: number;
  oldPrice?: number;
  discount?: { deletedPrice?: number };
  packaging?: { text?: string };
  startDate?: string;
  endDate?: string;
};

// Плитка товара из data-grid-data; описаны только используемые поля.
type Tile = {
  productId: number;
  fullTitle: string;
  brand?: { name?: string } | string;
  canonicalUrl: string;
  image?: string;
  keyfacts?: { wonCategoryPrimary?: string };
  regionsPrices: Record<
    string,
    {
      currentPrice?: Price;
      currentLidlPlusPrice?: { price: Price; lidlPlusText?: string };
    }
  >;
};

const iso = (d?: string) => (d ? new Date(d).toISOString() : null);

function toOffer(t: Tile): unknown {
  const region = Object.values(t.regionsPrices)[0];
  // Обычная цена важнее: Lidl Plus-цена даёт условие «нужна карта».
  // ponytail: если Lidl Plus-цена ниже обычной, она не учитывается.
  const plus = region.currentLidlPlusPrice;
  const p = region.currentPrice ?? plus!.price;
  const brand = typeof t.brand === "string" ? t.brand : t.brand?.name;
  const packaging = p.packaging?.text ?? null;
  const unit = unitPrice(p.price, packaging);
  return {
    externalId: String(t.productId),
    title: t.fullTitle.replace(/^-\s*/, "").trim(),
    brand: brand && brand !== "-" ? brand : null,
    packaging,
    price: p.price,
    oldPrice: (region.currentPrice ? p.discount?.deletedPrice : p.oldPrice) ?? null,
    unitPrice: unit?.unitPrice ?? null,
    unit: unit?.unit ?? null,
    condition: region.currentPrice ? null : (plus!.lidlPlusText ?? null),
    startsAt: iso(p.startDate),
    endsAt: iso(p.endDate),
    ean: null, // в Lidl есть только внутренний IAN, не EAN
    url: ORIGIN + t.canonicalUrl,
    imageUrl: t.image ?? null,
    category: t.keyfacts?.wonCategoryPrimary?.split("/").at(-1) ?? null,
  };
}

type Item = { gridbox: { data: Tile } };

export function parse(items: Item[]): ScrapeResult {
  const offers: Offer[] = [];
  let invalid = 0;
  for (const item of items) {
    try {
      const parsed = offerSchema.safeParse(toOffer(item.gridbox.data));
      if (parsed.success) offers.push(parsed.data);
      else invalid++;
    } catch {
      invalid++;
    }
  }
  return { offers: uniqueOffers(offers), invalid };
}

export async function scrape(): Promise<ScrapeResult> {
  const items: Item[] = [];
  let total = Number.POSITIVE_INFINITY;
  while (items.length < total) {
    const res = await fetch(`${API}&fetchsize=${PAGE_SIZE}&offset=${items.length}`, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) throw new Error(`Lidl: HTTP ${res.status}`);
    const body = (await res.json()) as { numFound?: number; items?: Item[] };
    if (typeof body.numFound !== "number" || !Array.isArray(body.items)) {
      throw new Error("Lidl: неожиданный ответ API, формат мог измениться");
    }
    total = body.numFound;
    if (body.items.length === 0) break; // сервер отдал меньше, чем обещал: не зацикливаемся
    items.push(...body.items);
  }
  // Сырой ответ лежит в debug/: workflow выгружает его артефактом только при сбое (FR-30).
  await mkdir("debug", { recursive: true });
  await writeFile("debug/lidl.json", JSON.stringify(items));
  const result = parse(items);
  if (result.offers.length === 0) throw new Error("Lidl: ни одной акции, формат API мог измениться");
  return result;
}
