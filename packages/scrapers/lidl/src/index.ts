import { mkdir, writeFile } from "node:fs/promises";
import * as cheerio from "cheerio";
import { type Offer, type ScrapeResult, offerSchema, unitPrice } from "@bestprice/core";

const ORIGIN = "https://www.lidl.lv";
// /robots.txt закрывает только /q/search и пути с цифр, эта страница разрешена (проверено вручную).
const PAGE = `${ORIGIN}/c/aktualie-piedavajumi/a10028219`;
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

export function parse(html: string): ScrapeResult {
  const offers: Offer[] = [];
  let invalid = 0;
  for (const el of cheerio.load(html)("[data-grid-data]").toArray()) {
    try {
      const parsed = offerSchema.safeParse(toOffer(JSON.parse(el.attribs["data-grid-data"])));
      if (parsed.success) offers.push(parsed.data);
      else invalid++;
    } catch {
      invalid++;
    }
  }
  return { offers, invalid };
}

export async function scrape(): Promise<ScrapeResult> {
  const res = await fetch(PAGE, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Lidl: HTTP ${res.status}`);
  const html = await res.text();
  // Сырой ответ лежит в debug/: workflow выгружает его артефактом только при сбое (FR-30).
  await mkdir("debug", { recursive: true });
  await writeFile("debug/lidl.html", html);
  const result = parse(html);
  if (result.offers.length === 0) throw new Error("Lidl: ни одной акции, вёрстка могла измениться");
  return result;
}
