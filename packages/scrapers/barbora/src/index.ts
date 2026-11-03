import { mkdir, writeFile } from "node:fs/promises";
import { type Offer, type ScrapeResult, offerSchema, rigaIso, uniqueOffers } from "@bestprice/core";

const ORIGIN = "https://barbora.lv";
// Внутренний JSON-API магазина, тот же запрос, что сайт делает по кнопке «Rādīt vairāk». Без cookies, голым fetch (проверено 2026-10-31).
// Limit=200 проходит, 1000 даёт 400. Depth=4 отдаёт дерево категорий целиком (при Depth=1 только верхний уровень).
// /robots.txt закрывает только корзину, оплату и личные страницы; каталог и /proxy/api открыты.
const API = `${ORIGIN}/proxy/api/v1/inventory/collection`;
const LIMIT = 200;
// Akcijas: цены со скидкой для всех (1752 на 2026-10-31). Paldies cena: цены по карте Paldies, срока нет (1934). Общих позиций нет.
const COLLECTIONS = ["50XV", "GAUV"];
const USER_AGENT = "BestPriceBot (personal project)";
// Как у Maxima: одинаковое условие нужно, чтобы одна и та же акция двух магазинов получила один ключ товара (docs/PLAN.md, «Сопоставление»).
const CARD = "Ar PALDIES karti";
const MAX_INVALID = 0.05;
const MAX_MISSING = 0.05;

type Item = {
  id: string;
  title: string;
  brand?: string | null;
  url: string;
  image?: string | null;
  imagesOriginal?: string[];
  categoryShortId?: string | null;
  price: number;
  status: string;
  promotion?: {
    type: string;
    oldPrice?: number;
    loyaltyCardRequired?: boolean;
    validTo?: string | null;
    quantity?: number;
    promotionPrice?: number;
    percentage?: number;
    minQuantity?: number;
    orMore?: boolean;
  } | null;
  comparativeUnit?: { type: string; price: number } | null;
};
type Node = { shortId: string; names?: { name: string; language: string }[]; children?: Node[] };

const r2 = (n: number) => Math.round(n * 100) / 100;

// shortId → «Piena produkti un olas / Siers / Krēmveida siers»: путь названий (lv) из дерева категорий сайта.
function categoryNames(trees: unknown[]): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (nodes: Node[], path: string[]) => {
    for (const n of nodes) {
      const name = n.names?.find((x) => x.language === "lv")?.name;
      const here = name ? [...path, name] : path;
      if (name) out.set(n.shortId, here.join(" / "));
      walk(n.children ?? [], here);
    }
  };
  for (const t of trees) walk(((t as Node[] | null) ?? [])[0]?.children ?? [], []);
  return out;
}

// Срок «до 2026-11-02» значит весь день включительно (как у Maxima), по Риге.
function endOfDay(validTo: string): string {
  const m = validTo.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) throw new Error("нет даты");
  return rigaIso(+m[1], +m[2], +m[3], 23, 59, 59);
}

// null: не предложение (нет в наличии или нет акции). В Akcijas таких 224 и 9 из 1752.
// price у Barbora не везде акционная, сверено с карточками сайта: «2 par 2€» (XForY) — price обычная цена штуки,
// «2 vai vairāk −30%» (CategoryPercentage) — price обычная цена, скидка применяется в корзине.
function toOffer(it: Item, names: Map<string, string>): unknown {
  const p = it.promotion;
  if (it.status !== "active" || !p) return null;
  let price = it.price;
  let oldPrice = p.oldPrice ?? null;
  let bundle: string | null = null;
  let scale = 1; // во сколько акционная цена за кг или л отличается от цены в данных
  if (p.type === "XForY") {
    price = p.promotionPrice!;
    oldPrice = r2(p.quantity! * it.price);
    bundle = `Cena par ${p.quantity} gab.`;
    scale = price / oldPrice;
  } else if (p.type === "CategoryPercentage") {
    scale = 1 - p.percentage! / 100;
    price = r2(it.price * scale);
    oldPrice = it.price;
    // Формат Rimi: «N un vairāk» (match.ts → conditionKind → minN); без «и более» условие сопоставление не поймёт.
    bundle = `${p.minQuantity}${p.orMore ? " un vairāk" : " gab."}`;
  } else if (p.type !== "Discount") {
    throw new Error(`неизвестный тип акции ${p.type}`);
  }
  const cu = it.comparativeUnit;
  const kgOrL = cu && (cu.type === "kg" || cu.type === "l");
  return {
    externalId: it.id,
    title: it.title.trim(),
    brand: it.brand || null,
    packaging: null,
    price,
    oldPrice,
    discountPercent: null,
    unitPrice: kgOrL ? r2(cu.price * scale) : null,
    unit: kgOrL ? cu.type : null,
    condition: [p.loyaltyCardRequired && CARD, bundle].filter(Boolean).join(" · ") || null,
    startsAt: null, // даты начала у Barbora нет
    endsAt: p.validTo ? endOfDay(p.validTo) : null,
    ean: null, // на сайте штрихкодов нет
    url: `${ORIGIN}/p/${it.url}`,
    imageUrl: it.imagesOriginal?.[0] ?? it.image ?? null,
    category: (it.categoryShortId && names.get(it.categoryShortId)) || null, // у 8 из 3060 категории нет вовсе
  };
}

export function parse(items: unknown[], trees: unknown[]): ScrapeResult {
  const names = categoryNames(trees);
  const offers: Offer[] = [];
  let invalid = 0;
  for (const it of items) {
    try {
      const raw = toOffer(it as Item, names);
      if (raw === null) continue;
      const parsed = offerSchema.safeParse(raw);
      if (parsed.success) offers.push(parsed.data);
      else invalid++;
    } catch {
      invalid++;
    }
  }
  return { offers: uniqueOffers(offers), invalid };
}

const ATTEMPTS = 3;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Повторяем сетевые ошибки (в том числе обрыв при чтении тела), 5xx и 429; остальные 4xx повтор не лечит (как у Maxima: findings/maxima-fetch-no-retry).
async function get(url: string, retryMs: number): Promise<{ count?: unknown; inventories?: unknown; categoryTree?: unknown }> {
  for (let attempt = 1; ; attempt++) {
    let failure: unknown;
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(60_000) });
      if (res.ok) return await res.json();
      failure = new Error(`Barbora: HTTP ${res.status}`);
      if (res.status < 500 && res.status !== 429) throw failure;
    } catch (e) {
      if (e === failure) throw e;
      failure = e;
    }
    if (attempt === ATTEMPTS) throw failure;
    await wait(retryMs * attempt);
  }
}

async function collection(id: string, retryMs: number): Promise<{ items: unknown[]; tree: unknown }> {
  const items: unknown[] = [];
  let tree: unknown = null;
  let count = 0;
  for (let offset = 0; ; offset += LIMIT) {
    const body = await get(`${API}/${id}?Offset=${offset}&Limit=${LIMIT}&Depth=4`, retryMs);
    if (!Array.isArray(body.inventories) || !Number.isInteger(body.count)) {
      throw new Error("Barbora: неожиданный ответ, формат мог измениться");
    }
    count = body.count as number;
    tree = body.categoryTree;
    items.push(...body.inventories);
    if (!body.inventories.length || items.length >= count) break;
  }
  // Если сервер урезал страницы, молча потеряли бы часть товаров (findings/maxima-limit-ceiling).
  // count включает позиции, которых API не отдаёт ни при каком Limit (2026-11-03: 1685 из 1729 и 2425 из 2443), поэтому допуск, а не равенство.
  if (items.length < count * (1 - MAX_MISSING)) throw new Error(`Barbora: получено ${items.length} из ${count} позиций ${id}, пагинация могла измениться`);
  return { items, tree };
}

export async function scrape(opts: { retryMs?: number } = {}): Promise<ScrapeResult> {
  const got = [];
  for (const id of COLLECTIONS) got.push(await collection(id, opts.retryMs ?? 3000));
  // Сырые данные лежат в debug/: workflow выгружает их артефактом только при сбое (FR-30).
  await mkdir("debug", { recursive: true });
  await writeFile("debug/barbora.json", JSON.stringify(got.map((g) => g.items)));
  const result = parse(got.flatMap((g) => g.items), got.map((g) => g.tree));
  const tiles = result.offers.length + result.invalid;
  // Порог ловит смену формата, когда «успех» был бы с огрызком данных.
  if (result.invalid > tiles * MAX_INVALID) {
    throw new Error(`Barbora: не разобрано ${result.invalid} из ${tiles} акций, формат мог измениться`);
  }
  if (result.offers.length === 0) throw new Error("Barbora: ни одной акции, формат мог измениться");
  return result;
}
