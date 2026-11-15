import { mkdir, writeFile } from "node:fs/promises";
import { type Offer, type ScrapeResult, fold, offerSchema, uniqueOffers, fetchRetry } from "@bestprice/core";

const ORIGIN = "https://e-latts.lv";
// Раздел «Akcijas» интернет-магазина LaTS: серверный HTML без JS и cookies, 40 плиток на страницу (разведка 2026-10-31: 573 плитки, 15 страниц).
// /robots.txt закрывает только служебный /_dgv/. Sitemap и API нет, счётчика товаров на странице нет: конец списка — пустая страница.
const SALE = `${ORIGIN}/products.sale.ppl`;
const MAX_PAGES = 100; // 15 страниц сейчас; предохранитель от бесконечного цикла, если сайт перестанет отдавать пустую страницу
const MAX_INVALID = 0.05;
// Обычно 438 акций (2026-10-31). Меньше половины — скорее всего обход оборвался (страница с ошибкой и кодом 200 выглядит как конец списка).
const MIN_OFFERS = 200;
const ALCOHOL = fold("Alkoholiskie dzērieni"); // верхняя категория алкоголя; в акциях 2026-10-31 её не было, но каталог меняется

const ENTITIES: Record<string, string> = { amp: "&", quot: '"', lt: "<", gt: ">", apos: "'" };
// Битая числовая сущность (за пределами Unicode) остаётся как есть, а не роняет разбор всей страницы.
const decode = (s: string) =>
  s.replace(/&(?:#(\d+)|#x([\da-f]+)|(\w+));/gi, (m, dec, hex, name) => {
    const code = dec ? +dec : hex ? parseInt(hex, 16) : null;
    if (code === null) return ENTITIES[name.toLowerCase()] ?? m;
    return code <= 0x10ffff ? String.fromCodePoint(code) : m;
  });
const text = (tile: string, re: RegExp) => {
  const v = tile.match(re)?.[1];
  return v === undefined ? null : decode(v).trim() || null;
};

// null: не предложение (нет старой цены, алкоголь). 135 из 573 плиток раздела без старой цены: скидки на них не видно ни в плитке, ни на карточке.
function toOffer(tile: string): unknown {
  const group = text(tile, /-oGroupPath">([^<]*)</);
  if (group && fold(group).startsWith(ALCOHOL)) return null;
  const oldPrice = text(tile, /-eOld">([\d.]+)</);
  if (!oldPrice) return null;
  // Цена с депозитом тары лежит отдельной строкой, в -price её нет (как у других магазинов депозит в цену не входит).
  const price = text(tile, /-oPrice[^"]*" -price="([\d.]+)"/);
  const per = tile.match(/-ePerUnit">€\s*([\d.]+)\s*\/\s*(Kg|L)</);
  const href = text(tile, /-oTitle[^"]*" href="([^"]+)"/);
  const img = text(tile, /<img id="PLGS-thumb-\d+" src="([^"]+)"/);
  return {
    externalId: text(tile, /-id="(\d+)"/),
    title: text(tile, /-oTitle[^"]*" href="[^"]+">([^<]*)</),
    brand: text(tile, /class="-brand"[^>]*>([^<]+)</),
    packaging: null,
    price: price && Number(price),
    oldPrice: Number(oldPrice),
    discountPercent: null,
    // «/ gab» (штучные) цены за кг или л не даёт: unit остаётся null.
    unitPrice: per ? Number(per[1]) : null,
    unit: per ? per[2].toLowerCase() : null,
    condition: null,
    startsAt: null, // сроков акций на сайте нет: действует, пока парсер видит строку (FR-34)
    endsAt: null,
    ean: null, // на сайте штрихкодов нет
    url: href && ORIGIN + href,
    imageUrl: img && ORIGIN + img,
    // « / » как у Barbora: changedCategories смотрит на последний сегмент пути.
    category: group?.split("/").join(" / ") ?? null,
  };
}

// Плитка кончается на -oMenu: у последней на странице дальше идут подвал и меню сайта, их названия категорий в разбор попасть не должны.
const tiles = (html: string) =>
  html.split(/(?=<div class="-oProduct[^"]*"\s+-id=")/).slice(1).map((t) => t.split('<div class="-oMenu">')[0]);

export function parse(html: string): ScrapeResult {
  const offers: Offer[] = [];
  let invalid = 0;
  for (const tile of tiles(html)) {
    const raw = toOffer(tile);
    if (raw === null) continue;
    const parsed = offerSchema.safeParse(raw);
    if (parsed.success) offers.push(parsed.data);
    else invalid++;
  }
  return { offers: uniqueOffers(offers), invalid };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Повторяем сетевые ошибки, 5xx и 429; остальные 4xx повтор не лечит (findings/maxima-fetch-no-retry).
const get = async (url: string, retryMs: number) => (await fetchRetry(url, { name: "e-latts", read: (t) => t, retryMs }))!;

export async function scrape(opts: { retryMs?: number; pauseMs?: number; minOffers?: number } = {}): Promise<ScrapeResult> {
  const pages: string[] = [];
  for (let p = 1; ; p++) {
    if (p > MAX_PAGES) throw new Error(`e-latts: больше ${MAX_PAGES} страниц акций, пагинация могла измениться`);
    const html = await get(`${SALE}?p=${p}`, opts.retryMs ?? 3000);
    if (!tiles(html).length) break;
    pages.push(html);
    await wait(opts.pauseMs ?? 200); // вежливая пауза: сайт небольшой, ≈16 запросов за прогон
  }
  if (!pages.length) throw new Error("e-latts: нет плиток на первой странице, формат мог измениться");
  // Сырые данные лежат в debug/: workflow выгружает их артефактом только при сбое (FR-30).
  await mkdir("debug", { recursive: true });
  await writeFile("debug/e-latts.html", pages.join("\n"));
  const results = pages.map(parse);
  const offers = uniqueOffers(results.flatMap((r) => r.offers));
  const invalid = results.reduce((n, r) => n + r.invalid, 0);
  const total = offers.length + invalid;
  // Порог ловит смену формата, когда «успех» был бы с огрызком данных.
  if (invalid > total * MAX_INVALID) throw new Error(`e-latts: не разобрано ${invalid} из ${total} акций, формат мог измениться`);
  if (!offers.length) throw new Error("e-latts: ни одной акции, формат мог измениться");
  if (offers.length < (opts.minOffers ?? MIN_OFFERS)) throw new Error(`e-latts: мало акций (${offers.length}), обход мог оборваться`);
  return { offers, invalid };
}
