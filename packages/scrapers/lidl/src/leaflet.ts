import { createHash } from "node:crypto";
import { z } from "zod";
import { type Offer, offerSchema, rigaIso, unitPrice } from "@bestprice/core";

// Буклет Lidl читает Gemini по картинке страницы; здесь только то, что вокруг модели: схема и промпт, разбор ответа API буклета и
// недоверчивая проверка ответа модели (цены с картинки она может прочитать неверно). Вызовы сети и базы: leaflet-run.ts.
export const ORIGIN = "https://www.lidl.lv";
// Читалка буклетов Lidl (Schwarz): открытый JSON без куки. Идентификатор буклета меняется каждую неделю, его берём со страницы-обзора.
export const FLYER_API = "https://endpoints.leaflets.schwarz/v4/flyer?flyer_identifier=";
export const OVERVIEW = `${ORIGIN}/c/lv-LV/akciju-bukleti/s10024390`;

export type Flyer = { id: string; name: string; startsAt: string; endsAt: string; pages: { number: number; image: string }[] };

const flyerSchema = z.object({
  flyer: z.object({
    id: z.string().min(1),
    name: z.string(),
    offerStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    offerEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    // zoom: картинка 2400 px по высоте, на ней Gemini читает мелкий шрифт; ссылка подписана и живёт недолго, качаем сразу.
    pages: z.array(z.object({ number: z.number().int().positive(), zoom: z.url() })).min(1),
  }),
});

export function parseFlyer(json: unknown): Flyer {
  const p = flyerSchema.safeParse(json);
  if (!p.success) throw new Error("Lidl: неожиданный ответ API буклета, формат мог измениться");
  const f = p.data.flyer;
  return { id: f.id, name: f.name, startsAt: f.offerStartDate, endsAt: f.offerEndDate, pages: f.pages.map((x) => ({ number: x.number, image: x.zoom })) };
}

/** Идентификаторы продуктовых буклетов со страницы-обзора (текущий и следующий). Непродовольственные, Lupilu и тематические не берём. */
export function pickFlyerIdentifiers(html: string): string[] {
  const ids = [...html.matchAll(/\/l\/lv\/akciju-buklets\/(aktualais-akciju-buklets-[a-z0-9-]+)\//g)].map((m) => m[1]);
  return [...new Set(ids)];
}

/** `--pages=1,3-5` → [1,3,4,5]; не задано → null (все страницы). Нужен, чтобы пробовать на паре страниц и не тратить квоту. */
export function parsePages(arg: string | undefined): number[] | null {
  if (arg === undefined) return null;
  const out = new Set<number>();
  for (const part of arg.split(",")) {
    const m = part.trim().match(/^(\d+)(?:-(\d+))?$/);
    const [a, b] = m ? [Number(m[1]), Number(m[2] ?? m[1])] : [0, -1];
    if (a < 1 || b < a) throw new Error(`--pages: не понимаю «${part.trim()}», нужно например 1,3-5`);
    for (let n = a; n <= b; n++) out.add(n);
  }
  return [...out];
}

// Схема ответа модели (generationConfig.responseSchema). price и discount_pct необязательны: у скидки на категорию цены нет,
// а обязательное поле заставляло модель писать 0 (проверено 2026-10-30).
const NS = { type: "STRING", nullable: true };
const NN = { type: "NUMBER", nullable: true };
export const LEAFLET_SCHEMA = {
  type: "OBJECT",
  properties: {
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          kind: { type: "STRING", enum: ["product", "category"] },
          name: { type: "STRING" },
          brand: NS,
          size: NS,
          price: NN,
          old_price: NN,
          price_card: NN,
          // Цена второго товара по условию «2. precei» (первый по обычной цене): это условие, а не скидка на товар.
          second_price: NN,
          discount_pct: NN,
          condition: NS,
          from: NS,
          to: NS,
          // Рамка фото товара [ymin, xmin, ymax, xmax] в долях страницы 0–1000 (как отдаёт сама Gemini); 0,0,0,0 — фото нет.
          // Плашка «Ar Lidl Plus» у большой цены: слабые модели не выполняют это правило прозой, булево поле выполняют.
          card_only: { type: "BOOLEAN" },
          photo_box: { type: "ARRAY", items: { type: "INTEGER" } },
        },
        // Все поля обязательны, nullable разрешает null. Если сделать обязательными только kind и name, модель вовсе не возвращает
        // цены (проверено 2026-10-31: у 6 из 7 товаров страницы 1 ни price, ни old_price, ни discount_pct).
        required: ["kind", "name", "brand", "size", "price", "old_price", "price_card", "second_price", "discount_pct", "condition", "from", "to", "card_only", "photo_box"],
      },
    },
  },
  required: ["items"],
};

export const LEAFLET_PROMPT = [
  "This is one page of a weekly advertising flyer of the Latvian store Lidl (text is in Latvian). Extract EVERY offer on the page.",
  "Return kind=product for a concrete product and kind=category for a discount on a whole group without a price",
  "(for example '-30% on all ground coffee of brand X' or '-30% on PIKOK cooked sausages'): then price is null and name says what the discount applies to.",
  "Fields: name as printed (include the brand), brand if printed, size (weight, volume or count as printed, e.g. '800 g', '1 l', '1 gab.'),",
  "price = the price any customer pays, old_price = the crossed-out price, discount_pct = the printed percentage as a number.",
  "If a tile has two prices, a regular one and a lower one 'Ar Lidl Plus' (loyalty card), put the regular one in price and the card one in price_card.",
  "second_price: a tile with 'PĒRKOT 1 GAB.' (buying one) and a lower price marked '2. precei' (the second item) is NOT a discount: price = the price of one item,",
  "second_price = the price of the second item, discount_pct null, old_price null, card_only false; the text '2. precei ar Lidl Plus' goes to condition. null otherwise.",
  "card_only = true when the big price is only for card holders: a small blue rounded square with the Lidl logo and the word 'Plus' sits next to the big price,",
  "usually with a small yellow label 'Ar Lidl Plus' above the percentage. Check every price tile for it. Put the big price in price anyway and the crossed-out price",
  "in old_price (the code swaps them). Tiles with a yellow 'Nenokavē' or 'Katru dienu' label have card_only=false.",
  "condition also holds limits, minimum basket and multi-buy deals: a tile with only '2+1' or '4+2' is kind=category with price and discount_pct null and condition '2+1' (add 'Lidl Plus' if marked).",
  "from / to: dates of the section banner above the offer in DD.MM form ('No sestdienas, 31.10., līdz 01.11.' means from 31.10 to 01.11;",
  "'No ceturtdienas, 29.10.' means from 29.10 and to null); null if the banner has no date.",
  "Copy names and prices exactly as printed, in the original Latvian: never translate or reword. Never guess: anything not visible on the page is null.",
  "photo_box = bounding box [ymin, xmin, ymax, xmax] of the product PHOTO only (the packshot, not the price or text), integers 0-1000 of the page height and width;",
  "one box around all photos of the offer; [0,0,0,0] if it has no photo.",
  "Ignore ads for the Lidl app, legal text and page footers.",
].join(" ");

const str = z.string().nullish();
const num = z.number().nullish();
const itemSchema = z.object({
  kind: z.enum(["product", "category"]),
  name: z.string(),
  brand: str,
  size: str,
  price: num,
  old_price: num,
  price_card: num,
  second_price: num,
  discount_pct: num,
  condition: str,
  from: str,
  to: str,
  card_only: z.boolean().nullish(),
  photo_box: z.array(z.number()).nullish(),
});

export type LeafletOffer = Offer & { priceCard: number | null; priceSecond: number | null; photoBox: number[] | null };

/** Рамка 0–1000 (уже проверена parseBox) → пиксели страницы: аргументы для sharp.extract. Поля вокруг рамки пробовали: в кадр лезут ценники. */
export function cropRegion(box: number[], width: number, height: number) {
  const [y0, x0, y1, x1] = box;
  const px = (v: number, size: number) => Math.round((v / 1000) * size);
  // Округляем края, а не размеры: round(a)+round(b-a) может быть на 1 px больше round(b) и выйти за страницу (sharp: bad extract area).
  const [left, top, right, bottom] = [px(x0, width), px(y0, height), px(x1, width), px(y1, height)];
  return { left, top, width: right - left, height: bottom - top };
}

/** Рамка от модели → [ymin, xmin, ymax, xmax] или null (нет фото, выход за страницу, вырожденная рамка). */
export function parseBox(b: number[] | null | undefined): number[] | null {
  if (b?.length !== 4 || !b.every((n) => Number.isInteger(n) && n >= 0 && n <= 1000)) return null;
  const [y0, x0, y1, x1] = b;
  return y1 - y0 >= 20 && x1 - x0 >= 20 ? b : null;
}

// Цена в буклете продуктового магазина выше этого — ошибка чтения; заодно numeric(10,2) в базе не переполнится и не уронит запись страницы.
const MAX_PRICE = 10_000;

/**
 * Какую модель пробовать сейчас. Основная (первая) после сбоя отдыхает cooldownMs, пока работает следующая по списку; когда перерыв
 * кончился, основная снова идёт первой, то есть сама проверяется на очередной настоящей странице, отдельных «пингов» не нужно.
 * null — все модели в перерыве.
 */
export function modelPool(models: string[], cooldownMs: number) {
  const downUntil = new Map<string, number>();
  return {
    pick: (now: number): string | null => models.find((m) => (downUntil.get(m) ?? 0) <= now) ?? null,
    fail: (model: string, now: number) => void downUntil.set(model, now + cooldownMs),
  };
}

/** Ответы Gemini, после которых следующие страницы бессмысленны (квота, ключ): стоп. Остальные сбои (сеть, 5xx, отказ по одной картинке) касаются одной страницы. */
export const isFatalGeminiStatus = (status: number) => status === 429 || status === 401 || status === 403;
type Ctx = { flyer: Flyer; identifier: string; page: number };

const clean = (s: string | null | undefined) => (s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200) || null;

/** «31.10» → день внутри периода буклета, иначе null (мусор, другой год, дата вне недели). Год берём из начала буклета, декабрь → январь. */
function dayInPeriod(dm: string | null | undefined, flyer: Flyer): string | null {
  const m = dm?.match(/^(\d{1,2})\.(\d{1,2})\.?$/);
  if (!m) return null;
  const [sy, sm] = flyer.startsAt.split("-").map(Number);
  const mo = Number(m[2]);
  const iso = `${mo < sm - 6 ? sy + 1 : sy}-${String(mo).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const ok = !Number.isNaN(Date.parse(iso)) && new Date(iso).toISOString().startsWith(iso);
  return ok && iso >= flyer.startsAt && iso <= flyer.endsAt ? iso : null;
}

const riga = (iso: string, end: boolean) => {
  const [y, m, d] = iso.split("-").map(Number);
  return end ? rigaIso(y, m, d, 23, 59, 59) : rigaIso(y, m, d, 0, 0, 0);
};

/**
 * Ответ модели → акции буклета. Модели не доверяем: запись без цены у товара, с нулевой ценой или с процентом, не сходящимся с ценами,
 * отбрасывается и попадает в invalid (строкой для лога). Ошибка JSON и формата всего ответа бросается: страница не считается обработанной.
 */
export function toLeafletOffers(text: string, ctx: Ctx): { offers: LeafletOffer[]; invalid: string[] } {
  const body: unknown = JSON.parse(text);
  const raw = (body as { items?: unknown })?.items;
  if (!Array.isArray(raw)) throw new Error("ответ модели без items");
  const offers: LeafletOffer[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const p = itemSchema.safeParse(r);
    const title = p.success ? clean(p.data.name) : null;
    if (!p.success || !title) {
      invalid.push(`формат записи: ${JSON.stringify(r).slice(0, 80)}`);
      continue;
    }
    const i = p.data;
    const isProduct = i.kind === "product";
    let price = isProduct ? (i.price ?? null) : null;
    let oldPrice = isProduct ? (i.old_price ?? null) : null;
    // «2. precei»: вторая дешевле первой, иначе ошибка чтения. Тогда процент и «по карте» относятся ко второму товару, не к цене товара.
    const priceSecond = price !== null && i.second_price != null && i.second_price > 0 && i.second_price < price ? i.second_price : null;
    let condition = clean(i.condition);
    let priceCard = price !== null && i.price_card != null && i.price_card > 0 && i.price_card < price ? i.price_card : null;
    const discount = priceSecond !== null ? null : (i.discount_pct ?? null);
    // Плашка «Ar Lidl Plus»: большая цена только по карте, зачёркнутая это обычная цена для всех. Без зачёркнутой цена остаётся, условие «Lidl Plus».
    if (priceSecond !== null) {
      priceCard = null;
      oldPrice = null;
    } else if (i.card_only && price !== null && priceCard === null) {
      if (oldPrice !== null && oldPrice > price) [priceCard, price, oldPrice] = [price, oldPrice, null];
      else if (!condition?.includes("Lidl Plus")) condition = [condition, "Lidl Plus"].filter(Boolean).join(", ");
    }
    if ([price, oldPrice].some((x) => x !== null && x > MAX_PRICE)) {
      invalid.push(`${title}: цена ${price}/${oldPrice} выше ${MAX_PRICE} €, ошибка чтения`);
      continue;
    }
    if (isProduct && !(price !== null && price > 0)) {
      invalid.push(`${title}: у товара нет цены`);
      continue;
    }
    // Акция «2+1», «4+2» на группу товаров: ни цены, ни процента, вся суть в condition.
    const deal = !isProduct && discount === null && clean(i.condition) !== null;
    if (!isProduct && discount === null && !deal) {
      invalid.push(`${title}: у скидки на категорию нет ни процента, ни условия`);
      continue;
    }
    // Процент должен сходиться с ценами (допуск 2 п.п. на округление): иначе модель прочитала что-то неверно.
    if (discount !== null && oldPrice !== null && oldPrice > 0) {
      const fits = [price, priceCard].some((x) => x !== null && Math.abs(Math.round((1 - x / oldPrice) * 100) - discount) <= 2);
      if (!fits) {
        invalid.push(`${title}: скидка ${discount}% не сходится с ценами ${price}/${oldPrice}`);
        continue;
      }
    }
    const packaging = clean(i.size);
    const unit = price !== null ? unitPrice(price, packaging) : null;
    const from = dayInPeriod(i.from, ctx.flyer) ?? ctx.flyer.startsAt;
    const to = dayInPeriod(i.to, ctx.flyer) ?? ctx.flyer.endsAt;
    const brand = clean(i.brand);
    const base = {
      // Ключ стабилен между запусками: тот же товар на той же странице обновляется на месте, а не дублируется.
      externalId: createHash("sha1").update([ctx.flyer.id, ctx.page, i.kind, title.toLowerCase(), packaging, price, priceCard, discount, priceSecond].join("|")).digest("hex").slice(0, 16),
      title,
      brand: brand && brand !== "-" ? brand : null,
      packaging,
      price,
      oldPrice,
      discountPercent: discount !== null && Number.isInteger(discount) ? discount : null,
      unitPrice: unit?.unitPrice ?? null,
      unit: unit?.unit ?? null,
      condition,
      startsAt: riga(from, false),
      endsAt: riga(to < from ? ctx.flyer.endsAt : to, true),
      ean: null,
      url: `${ORIGIN}/l/lv/akciju-buklets/${ctx.identifier}/view/flyer/page/${ctx.page}`,
      imageUrl: null,
      category: null,
    };
    const parsed = deal ? { success: true as const, data: base } : offerSchema.safeParse(base); // offerSchema требует цену или процент
    if (!parsed.success) {
      invalid.push(`${title}: ${parsed.error.issues[0]?.message ?? "не прошла проверку"}`);
      continue;
    }
    if (seen.has(parsed.data.externalId)) continue;
    seen.add(parsed.data.externalId);
    offers.push({ ...parsed.data, priceCard, priceSecond, photoBox: parseBox(i.photo_box) });
  }
  return { offers, invalid };
}
