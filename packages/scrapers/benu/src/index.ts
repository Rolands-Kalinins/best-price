import { mkdir, writeFile } from "node:fs/promises";
import { type Product, type ProductScrapeResult, productSchema, rigaIso, uniqueProducts } from "@bestprice/core";

// Каталог сайта (benu.lv) рисуется из поиска Luigi's Box: открытый JSON, тот же запрос, что делает сайт. Без cookies, голым fetch (проверено 2026-11-01).
// tracker_id вшит в HTML страниц. size не больше 200 (иначе 400), окно результатов 10 000, total_hits выше не показывает.
// Фильтр status:active + availability:1 оставляет ≈6 070 товаров, то есть окно не мешает. Без sort=item_id:asc сортировка нестабильна:
// страницы пересекаются, и 7% записей терялись (ответ тот же, а уникальных меньше). robots.txt закрывает только /*?vars и /*?search=.
const API = "https://live.luigisbox.com/search?tracker_id=232949-269228&f[]=type:item&f[]=status:active&f[]=availability:1&sort=item_id:asc";
const SHOP = "https://www.benu.lv";
const PER_PAGE = 200;
const WINDOW = 10_000;
const USER_AGENT = "BestPriceBot (personal project)";
const MAX_INVALID = 0.05;
const CARD = "Ar Benu karti";
// Каталог в выборке ≈6 070; оборванный обход выглядел бы успехом, поэтому порог.
const MIN_PRODUCTS = 4500;

type Hit = { url: string; attributes: Record<string, any> };

// Поля приходят массивами из одного элемента (["BIODERMA"]), числа иногда строкой.
const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);

// «Skaistums un ādas kopšana|Ķermeņa kopšana» → «skaistums-un-adas-kopsana/kermena-kopsana»: слаги без диакритики, как у Mēness, по ним categorize ищет основы.
function category(a: Hit["attributes"]): string | null {
  for (let n = 5; n >= 1; n--) {
    const path = first(a[`category_upto_lvl_${n}`]);
    if (typeof path === "string" && path) {
      const slug = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      return path.split("|").map(slug).filter(Boolean).join("/") || null;
    }
  }
  return null;
}

// «01.11. - 30.11.» — день и месяц без года, по Риге. Конец ищем в ближайшем будущем (срок уже закончился не может быть в выдаче),
// начало в том же году или в прошлом, если выходит позже конца («15.12. - 10.01.»).
function period(s: unknown, now: Date): [string | null, string | null] {
  const m = typeof s === "string" ? s.match(/^(\d{2})\.(\d{2})\.\s*-\s*(\d{2})\.(\d{2})\.$/) : null;
  if (!m) return [null, null];
  const [sd, sm, ed, em] = m.slice(1).map(Number);
  let y = now.getUTCFullYear();
  if (Date.UTC(y, em - 1, ed + 1) < now.getTime()) y++;
  const sy = sm > em || (sm === em && sd > ed) ? y - 1 : y;
  return [rigaIso(sy, sm, sd, 0, 0, 0), rigaIso(y, em, ed, 23, 59, 59)];
}

function toProduct(h: Hit, now: Date): unknown {
  const a = h.attributes;
  const id = a.item_id ?? first(a.to_cart_id);
  const ean = first(a.ean);
  const hasOld = a.price_old_amount > a.price_amount;
  const [startsAt, endsAt] = hasOld ? period(first(a.classic_discount_date), now) : [null, null];
  const card = a.hasLCPrice?.[0] === 1 ? Number(a.loyal_customer_price_amount) : 0;
  const [cardStartsAt, cardEndsAt] = card ? period(first(a.benu_card_discount_date), now) : [null, null];
  return {
    externalId: id == null ? "" : String(id),
    title: String(first(a.titleRaw) ?? a.title ?? "").trim(),
    brand: first(a.brand) || null,
    packaging: null, // размер только в названии, его разбирает матчер
    price: a.price_amount,
    oldPrice: hasOld ? a.price_old_amount : null,
    startsAt,
    endsAt,
    // Цена по карте Benu (в выборке 2026-11-01 у продаваемых товаров её не было, поля есть у скрытых), со своим периодом.
    cardPrice: card || null,
    cardCondition: card ? CARD : null,
    cardStartsAt,
    cardEndsAt,
    // В поле ean бывают PZN и внутренние коды («PZN-17444652», «-16563662»): штрихкодом считаем только 8–14 цифр.
    ean: typeof ean === "string" && /^\d{8,14}$/.test(ean) ? ean : null,
    url: a.original_url ?? SHOP + h.url,
    imageUrl: a.image_link ?? null,
    category: category(a),
    prescription: first(a.drugType) === "RX",
    inStock: a.availability === "1",
  };
}

export function parse(hits: unknown[], now = new Date()): ProductScrapeResult {
  const products: Product[] = [];
  let invalid = 0;
  for (const h of hits as Hit[]) {
    // Страховка от молча проигнорированного фильтра: скрытые и новые товары в каталог не берём.
    if (first(h.attributes?.status) !== "active") continue;
    try {
      const parsed = productSchema.safeParse(toProduct(h, now));
      if (parsed.success) products.push(parsed.data);
      else invalid++;
    } catch {
      invalid++;
    }
  }
  return { products: uniqueProducts(products), invalid };
}

const ATTEMPTS = 4;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Повторяем сетевые ошибки, 5xx и 429 (сайт отвечал «Retry later» при частых запросах); остальные 4xx повтор не лечит (findings/maxima-fetch-no-retry).
async function get(url: string, retryMs: number): Promise<{ results?: { total_hits?: unknown; hits?: unknown } }> {
  for (let attempt = 1; ; attempt++) {
    let failure: unknown;
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(60_000) });
      if (res.ok) return await res.json();
      failure = new Error(`Benu: HTTP ${res.status}`);
      if (res.status < 500 && res.status !== 429) throw failure;
    } catch (e) {
      if (e === failure) throw e;
      failure = e;
    }
    if (attempt === ATTEMPTS) throw failure;
    await wait(retryMs * attempt);
  }
}

export async function scrape(opts: { retryMs?: number; pauseMs?: number; minProducts?: number; perPage?: number; now?: Date } = {}): Promise<ProductScrapeResult> {
  const retryMs = opts.retryMs ?? 5000;
  const perPage = opts.perPage ?? PER_PAGE;
  const hits: Hit[] = [];
  let total = 0;
  for (let p = 1; p === 1 || (hits.length < total && p <= Math.ceil(total / perPage)); p++) {
    const body = await get(`${API}&size=${perPage}&page=${p}`, retryMs);
    const r = body.results;
    if (!Array.isArray(r?.hits) || !Number.isInteger(r?.total_hits)) throw new Error("Benu: неожиданный ответ, формат мог измениться");
    total = r.total_hits as number;
    // total_hits выше окна не показывает: упёрлись — часть каталога за окном, выборку надо делить (findings/meness-result-window).
    if (total >= WINDOW) throw new Error(`Benu: total_hits ${total}, окно результатов 10 000 исчерпано, выборку надо делить`);
    if (!r.hits.length) break;
    hits.push(...(r.hits as Hit[]));
    if (p === 1) {
      // Сырая первая страница в debug/: workflow выгружает её артефактом при сбое (FR-30).
      await mkdir("debug", { recursive: true });
      await writeFile("debug/benu-page1.json", JSON.stringify(body));
    }
    await wait(opts.pauseMs ?? 700);
  }
  // Если сервер урезал страницы, молча потеряли бы часть товаров (findings/maxima-limit-ceiling). 1% запаса: каталог меняется во время обхода.
  if (hits.length < total * 0.99) throw new Error(`Benu: получено ${hits.length} из ${total}, пагинация могла измениться`);
  const result = parse(hits, opts.now);
  const seen = result.products.length + result.invalid;
  if (result.invalid > seen * MAX_INVALID) {
    throw new Error(`Benu: не разобрано ${result.invalid} из ${seen} товаров, формат мог измениться`);
  }
  const min = opts.minProducts ?? MIN_PRODUCTS;
  if (result.products.length < min) {
    throw new Error(`Benu: всего ${result.products.length} товаров, ожидалось от ${min}`);
  }
  return result;
}
