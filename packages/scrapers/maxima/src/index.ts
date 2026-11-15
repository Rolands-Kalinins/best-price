import { mkdir, writeFile } from "node:fs/promises";
import { type Offer, type ScrapeResult, offerSchema, rigaIso, uniqueOffers, fetchRetry } from "@bestprice/core";

const ORIGIN = "https://www.maxima.lv";
// Тот же запрос, что сайт делает по кнопке «ещё»: JSON {html, totalItems}, в html готовые плитки.
// limit выше числа акций отдаёт все за раз: потолка в 1000 у сервера нет (limit=2000 вернул все 1136 на 2026-10-27, акций было 878 на 2026-10-25), cookies не нужны.
// Запас до 5000; если акций станет больше, проверка totalItems в scrape() упадёт, а не потеряет часть молча.
// /robots.txt закрывает только /fileman/ (проверено 2026-10-25).
const API = `${ORIGIN}/ajax/salesloadmore?sort_by=newest&limit=5000&ajax=1`;
// Карточек товаров на сайте нет: все плитки ведут на страницу акций.
const PAGE = `${ORIGIN}/piedavajumi`;
const CARD = "Ar PALDIES karti";
const MAX_INVALID = 0.05;

const ENTITIES: Record<string, string> = { amp: "&", quot: '"', lt: "<", gt: ">", apos: "'" };
const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&(amp|quot|lt|gt|apos);/g, (_, e) => ENTITIES[e])
    .replace(/\s+/g, " ")
    .trim();

// Цена на плитке: рубли и центы в двух div'ах.
function money(html: string): number {
  const m = html.match(/price-value">\s*(\d+)\s*<[\s\S]*?cents-value">\s*(\d+)\s*</);
  if (!m) throw new Error("нет цены");
  return Number(`${m[1]}.${m[2]}`);
}

// «22.10. - 26.10.2026.» или «11.02.2025. - 28.10.2026.»: у начала года может не быть.
function period(text: string): { startsAt: string; endsAt: string } {
  const m = text.match(/^(\d+)\.(\d+)\.(?:(\d{4})\.)?\s*-\s*(\d+)\.(\d+)\.(\d{4})\.?$/);
  if (!m) throw new Error("нет дат");
  const [d1, m1, y1, d2, m2, y2] = [m[1], m[2], m[3], m[4], m[5], m[6]].map((x) => (x ? Number(x) : undefined));
  const endsAt = rigaIso(y2!, m2!, d2!, 23, 59, 59);
  let startsAt = rigaIso(y1 ?? y2!, m1!, d1!, 0, 0, 0);
  // «29.12. - 04.01.2027.»: начало в прошлом году.
  if (startsAt > endsAt && y1 === undefined) startsAt = rigaIso(y2! - 1, m1!, d1!, 0, 0, 0);
  return { startsAt, endsAt };
}

// «Saldumiem MILKA» → MILKA: бренд пишут заглавными в конце. Нет заглавных слов («Majonēzēm») — бренда нет.
function brandOf(title: string): string | null {
  const words = title.replace(/,?\s*\(.*\)\s*$/, "").split(" ");
  const brand: string[] = [];
  for (let w = words.at(-1); w && (w === "&" || (/\p{L}/u.test(w) && w === w.toUpperCase())); w = words.at(-1)) {
    brand.unshift(words.pop()!);
  }
  while (brand[0] === "&") brand.shift();
  return brand.join(" ") || null;
}

// Значок у цены: «2 gab.» или «1 + 1» значит, что цена на плитке за всё количество («2x 130 g»), а не за одну упаковку.
// Проверено на 9 плитках: цена ÷ общий вес = цена за кг из названия.
function bundle(hint: string): string {
  const qty = hint.split("+").reduce((sum, x) => sum + (parseInt(x) || 0), 0);
  return qty ? `Cena par ${qty} gab.${hint.includes("+") ? ` (${hint})` : ""}` : hint;
}

// Плитка бывает двух видов: цена (по карте PALDIES, со старой ценой или просто цена EDLP)
// и «−30%» на бренд или категорию без цены.
function toOffer(tile: string): unknown {
  const field = (re: RegExp) => tile.match(re)?.[1];
  const title = decode(field(/<div class="title">([^<]*)<\/div>/) ?? "");
  const priceBlock = tile.match(/class="item-price-new([^"]*)"[^>]*>([\s\S]*?)(?=class="item-price-(?:regular|info)|$)/);
  const card = !!priceBlock?.[1].includes("paldies");
  const regular = field(/class="item-price-regular[^"]*">([\s\S]*?)(?=class="tags |$)/);
  // Перед старой ценой бывает пометка «no» («от») во вложенном div, поэтому читаем до соседнего блока.
  const old = field(/class="info-old-price">([\s\S]*?)(?=item-price-info-right|class="tags |$)/)?.match(
    /price-value">\s*(\d+),(\d{2})/,
  );

  // Цена за кг или л написана в названии: «(0,48 €/kg)», у карточных две — берём первую (по карте), «no 9,66» = «от».
  const unit = field(/class="item-title-text[^"]*">\s*([^<]*)</)?.match(/\((?:no\s+)?(\d+),(\d{2})\s*€\/(kg|l)\)/);
  const discount = field(/discount-value">\s*(\d+)\s*</);
  const extra = field(/class="item-price-icon [^"]*">\s*([^<]*?)\s*</);
  const hint = field(/class="info-hint-value[^"]*">\s*([^<]*?)\s*</);

  return {
    externalId: field(/data-product-id="(\d+)"/),
    title,
    brand: priceBlock ? null : brandOf(title),
    packaging: null,
    price: priceBlock ? money(priceBlock[2]) : null,
    oldPrice: regular ? money(regular) : old ? Number(`${old[1]}.${old[2]}`) : null,
    discountPercent: priceBlock ? null : Number(discount),
    unitPrice: unit ? Number(`${unit[1]}.${unit[2]}`) : null,
    unit: unit?.[3] ?? null,
    condition: [card && CARD, hint && bundle(hint), extra && decode(extra)].filter(Boolean).join(" · ") || null,
    ...period(field(/data-dates-interval="([^"]*)"/) ?? ""),
    ean: null, // на сайте штрихкодов нет
    url: PAGE,
    imageUrl: ((src) => (src ? ORIGIN + src : null))(field(/class="img">\s*<img[^>]*src="([^"]*)"/)),
    category: null, // нужно более глубокое исследование: категория есть только в фильтре, 26 запросов (риск бана)
  };
}

export function parse(html: string): ScrapeResult {
  const offers: Offer[] = [];
  let invalid = 0;
  for (const tile of html.split('<div class="col-third offer-item').slice(1)) {
    try {
      const parsed = offerSchema.safeParse(toOffer(tile));
      if (parsed.success) offers.push(parsed.data);
      else invalid++;
    } catch {
      invalid++;
    }
  }
  return { offers: uniqueOffers(offers), invalid };
}


// Запрос один и весит ≈4 МБ: единичный обрыв («terminated», 2026-10-29) нельзя делать фатальным.
// Повторяем сетевые ошибки (в том числе обрыв при чтении тела), 5xx и 429; остальные 4xx повтор не лечит.
type Body = { html?: unknown; totalItems?: unknown };
const get = async (retryMs: number) => (await fetchRetry(API, { name: "Maxima", read: (t) => JSON.parse(t) as Body, retryMs }))!;

export async function scrape(opts: { retryMs?: number } = {}): Promise<ScrapeResult> {
  const body = await get(opts.retryMs ?? 3000);
  // Сайт отдаёт totalItems строкой ("878"), поэтому приводим к числу.
  const total = Number(body.totalItems);
  if (typeof body.html !== "string" || !Number.isInteger(total)) {
    throw new Error("Maxima: неожиданный ответ, формат мог измениться");
  }
  // Сырой ответ лежит в debug/: workflow выгружает его артефактом только при сбое (FR-30).
  await mkdir("debug", { recursive: true });
  await writeFile("debug/maxima.json", JSON.stringify(body));
  const result = parse(body.html);
  // Если сервер урезал limit, молча потеряли бы часть товаров.
  const tiles = result.offers.length + result.invalid;
  if (tiles < total) {
    throw new Error(`Maxima: получено ${tiles} из ${total} акций, лимит запроса мог измениться`);
  }
  // Сейчас невалидных 0 из 878; порог ловит смену разметки, когда «успех» был бы с огрызком данных.
  if (result.invalid > tiles * MAX_INVALID) {
    throw new Error(`Maxima: не разобрано ${result.invalid} из ${tiles} акций, разметка могла измениться`);
  }
  if (result.offers.length === 0) throw new Error("Maxima: ни одной акции, формат мог измениться");
  return result;
}
