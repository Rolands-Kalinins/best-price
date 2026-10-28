import { mkdir, writeFile } from "node:fs/promises";
import { z } from "zod";
import { type Offer, type ScrapeResult, offerSchema, uniqueOffers, unitPrice } from "@bestprice/core";

// Внутренний API сайта (его зовёт страница акций), cookies не нужны, /robots.txt: Allow: /.
// Метод только POST (GET даёт 405). Пустой discountTypes = все акции магазина: типы 3 (акция), 9 (цена по карте),
// 18 (ZG) и 21 (TIP TOP), вместе 1402 на 2026-10-28. Каталога без акций у Etop нет (проверено 2026-10-28).
const ORIGIN = "https://etop.lv";
const API = `${ORIGIN}/v1/Products/GetPromotionProducts`;
const PAGE = `${ORIGIN}/lv/visi-akcijas-produkti`;
const USER_AGENT = "BestPriceBot (personal project)";
// pageSize=1000 без фильтра типов обрезается до 1000 из 1402 при hasMore:false, поэтому 500 и страницы.
// totalCount на первой странице занижен (1000), верен с последней, hasMore надёжен.
const PAGE_SIZE = 500;
const MAX_PAGES = 20;
const MAX_INVALID = 0.05;
const CARD = "Ar top! karti";

const num = z.number().nullable().default(null);
const productSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  brand: z.string().nullable().default(null),
  // price и discountedPrice равны (акционная цена); loyaltyPrice есть у типов 9 и 21.
  discountedPrice: z.number(),
  loyaltyPrice: num,
  // Обычная цена до акции: диапазон, 0 = неизвестна.
  regPriceMin: num,
  regPriceMax: num,
  discountStartDate: z.string(),
  discountEndDate: z.string(),
  ean: z.string().nullable().default(null),
  normalImageUrl: z.string().nullable().default(null),
  category: z.object({ name: z.string() }).nullable().default(null),
});

const iso = (d: string, shiftMs = 0) => new Date(new Date(d).getTime() + shiftMs).toISOString();

function toOffer(raw: unknown): unknown {
  const p = productSchema.parse(raw);
  // Цена по карте ниже обычной: предложение по карте, обычная цена становится старой. Равна обычной (TIP TOP): просто цена.
  const card = p.loyaltyPrice !== null && p.loyaltyPrice < p.discountedPrice;
  const price = card ? p.loyaltyPrice! : p.discountedPrice;
  const unit = unitPrice(price, p.name); // серверная цена за единицу ненадёжна: у 223 из 1402 не сходится с весом
  return {
    externalId: p.id,
    title: p.name.replace(/\s+/g, " ").trim(),
    brand: p.brand || null,
    packaging: null,
    price,
    oldPrice: card ? p.discountedPrice : p.regPriceMin || p.regPriceMax || null,
    discountPercent: null,
    unitPrice: unit?.unitPrice ?? null,
    unit: unit?.unit ?? null,
    condition: card ? CARD : null,
    startsAt: iso(p.discountStartDate),
    // Сервер ставит конец на полночь по Риге следующего дня (22:00Z), сайт пишет «līdz 03.11.»: берём конец этого дня.
    endsAt: iso(p.discountEndDate, -1000),
    ean: p.ean || null,
    url: PAGE,
    imageUrl: p.normalImageUrl,
    category: p.category?.name ?? null,
  };
}

export function parse(list: unknown[]): ScrapeResult {
  const offers: Offer[] = [];
  let invalid = 0;
  for (const raw of list) {
    try {
      const parsed = offerSchema.safeParse(toOffer(raw));
      if (parsed.success) offers.push(parsed.data);
      else invalid++;
    } catch {
      invalid++;
    }
  }
  return { offers: uniqueOffers(offers), invalid };
}

export async function scrape(fetcher: typeof fetch = fetch, pageSize = PAGE_SIZE): Promise<ScrapeResult> {
  const list: unknown[] = [];
  let total = 0;
  for (let page = 1; ; page++) {
    if (page > MAX_PAGES) throw new Error(`Etop: больше ${MAX_PAGES} страниц, пагинация могла измениться`);
    const res = await fetcher(API, {
      method: "POST",
      headers: { "User-Agent": USER_AGENT, "Content-Type": "application/json" },
      body: JSON.stringify({ discountTypes: [], page, pageSize }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`Etop: HTTP ${res.status}`);
    const body = (await res.json()) as { list?: unknown; totalCount?: unknown; hasMore?: unknown };
    if (!Array.isArray(body.list) || !Number.isInteger(body.totalCount) || typeof body.hasMore !== "boolean") {
      throw new Error("Etop: неожиданный ответ, формат мог измениться");
    }
    list.push(...body.list);
    total = body.totalCount as number;
    if (!body.hasMore) break;
  }
  // Сырой ответ лежит в debug/: workflow выгружает его артефактом только при сбое (FR-30).
  await mkdir("debug", { recursive: true });
  await writeFile("debug/etop.json", JSON.stringify(list));
  // Если сервер урезал страницы, молча потеряли бы часть товаров.
  if (list.length < total) throw new Error(`Etop: получено ${list.length} из ${total} товаров, пагинация могла измениться`);
  const result = parse(list);
  if (result.invalid > list.length * MAX_INVALID) {
    throw new Error(`Etop: не разобрано ${result.invalid} из ${list.length} товаров, формат мог измениться`);
  }
  if (result.offers.length === 0) throw new Error("Etop: ни одного товара, формат мог измениться");
  return result;
}
