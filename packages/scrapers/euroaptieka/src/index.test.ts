import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parse, parseCardPrices, parseSitemap, scrape } from "./index";

const fx = (name: string) => readFileSync(`fixtures/${name}`, "utf8");
const ibumetin = fx("card-ibumetin.html");
const vitiron = fx("card-vitiron.html");
const akcijas = fx("akcijas.html");

test("parseSitemap: только латышские адреса товаров, русские дубли (/ru/) отброшены", () => {
  const urls = parseSitemap(fx("sitemap.xml"));
  assert.ok(urls.length >= 1);
  assert.ok(urls.every((u) => u.startsWith("https://www.euroaptieka.lv/p/") && !u.includes("/ru/")));
  assert.ok(urls.includes("https://www.euroaptieka.lv/p/ibumetin-200-mg-apvalkotas-tabletes-n10"));
});

test("parse: карточка → артикул, цена в евро (в данных центы), штрихкод, бренд, картинка, путь категории", () => {
  const { products, invalid } = parse([ibumetin, vitiron]);
  assert.equal(invalid, 0);
  const [a, b] = products;
  assert.equal(a.externalId, "12160");
  assert.equal(a.title, "IBUMETIN 200 mg apvalkotās tabletes, N10");
  assert.equal(a.brand, "IBUMETIN");
  assert.equal(a.price, 2.49);
  assert.equal(a.oldPrice, null); // цена скидки по клубной карте в карточке не лежит
  assert.equal(a.ean, "4741273106933");
  assert.equal(a.url, "https://www.euroaptieka.lv/p/ibumetin-200-mg-apvalkotas-tabletes-n10");
  assert.equal(a.imageUrl, "https://api.euroaptieka.lv/media/cache/ev_medium/96/b8/d6acd487990b9dd1a4b019287614.png");
  // Путь из хлебных крошек, как slug-путь Mēness: по нему словарь категорий находит «medikament».
  assert.equal(a.category, "bezrecepsu-medikamenti/sapes/galvassapes");
  assert.equal(a.inStock, true);
  assert.equal(a.prescription, false);
  assert.equal(a.startsAt, null);
  // Акционный в клубе товар: в карточке обычная цена 20,29, а не клубная 9,74.
  assert.equal(b.externalId, "71678");
  assert.equal(b.price, 20.29);
  assert.equal(b.ean, "4771295308053");
});

test("parse: нет в наличии и нет штрихкода", () => {
  const html = ibumetin.replace("schema.org/InStock", "schema.org/OutOfStock").replace(/\\"gtin13\\":\\"\d+\\",/, "");
  const p = parse([html]).products[0];
  assert.equal(p.inStock, false);
  assert.equal(p.ean, null);
});

test("parse: страница без данных товара и битая цена считаются в invalid", () => {
  const noPrice = ibumetin.replace(/\\"price\\":249/, '\\"price\\":0');
  const r = parse(["<html>captcha</html>", noPrice, vitiron]);
  assert.equal(r.invalid, 2);
  assert.equal(r.products.length, 1);
});

test("parseCardPrices: клубная цена, условие и срок по Риге; обычные плитки и плитки без цены пропущены", () => {
  const m = parseCardPrices(akcijas);
  assert.deepEqual([...m.keys()].sort(), ["71678", "81060"]);
  const v = m.get("71678")!;
  assert.equal(v.cardPrice, 9.74);
  assert.equal(v.cardCondition, "Lojalitātes klubs · Iepērkoties vismaz 9 EUR vērtībā");
  // Время по Риге: после 25.10 действует зимнее (UTC+2), поэтому 31.10 00:00 = 30.10 22:00 UTC.
  assert.equal(v.cardStartsAt, "2026-10-30T22:00:00.000Z");
  assert.equal(v.cardEndsAt, "2026-11-30T21:59:59.000Z");
  assert.equal(m.get("81060")!.cardEndsAt, "2026-11-01T21:59:59.000Z");
  assert.equal(m.get("81060")!.cardPrice, 26.99);
});

test("parseCardPrices: срок через Новый год получает прошлый год у начала", () => {
  const html = akcijas.replace(/31\.10\.-30\.11\.2026\./g, "20.12.-10.01.2027.");
  const v = parseCardPrices(html).get("71678")!;
  assert.equal(v.cardStartsAt, "2026-12-19T22:00:00.000Z");
  assert.equal(v.cardEndsAt, "2027-01-10T21:59:59.000Z");
});

// Подмена fetch по адресу: карта url → тело или статус; счётчик вызовов по адресу.
function mockFetch(map: Record<string, (string | number)[]>) {
  const real = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (url: string) => {
    calls.push(url);
    const queue = map[url];
    if (!queue) return new Response("not found", { status: 404 });
    const r = queue.length > 1 ? queue.shift()! : queue[0];
    return typeof r === "number" ? new Response("err", { status: r }) : new Response(r);
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = real) };
}
const SITEMAP = "https://www.euroaptieka.lv/sitemap/products.xml";
const AKCIJAS = "https://www.euroaptieka.lv/l/akcijas";
const A = "https://www.euroaptieka.lv/p/ibumetin-200-mg-apvalkotas-tabletes-n10";
const B = "https://www.euroaptieka.lv/p/vitiron-active-suscaps-100-daily-dose-30-kapsulas";
const sitemap = (...urls: string[]) => `<urlset>${urls.map((u) => `<url><loc>${u}</loc></url>`).join("")}</urlset>`;
const opts = { retryMs: 0, pauseMs: 0, concurrency: 2, minProducts: 1 };

test("scrape: sitemap → карточки, повтор после 500, клубная цена из /l/akcijas по артикулу", async () => {
  const m = mockFetch({ [SITEMAP]: [sitemap(A, B, "https://www.euroaptieka.lv/ru/p/x")], [A]: [500, ibumetin], [B]: [vitiron], [AKCIJAS]: [akcijas] });
  try {
    const { products, invalid } = await scrape(opts);
    assert.deepEqual(products.map((p) => p.externalId).sort(), ["12160", "71678"]);
    const by = Object.fromEntries(products.map((p) => [p.externalId, p]));
    assert.equal(by["71678"].price, 20.29); // для всех
    assert.equal(by["71678"].cardPrice, 9.74); // по клубной карте
    assert.equal(by["71678"].cardEndsAt, "2026-11-30T21:59:59.000Z");
    assert.equal(by["12160"].cardPrice, null);
    assert.equal(invalid, 0);
    assert.equal(m.calls.filter((c) => c === A).length, 2);
    assert.ok(!m.calls.some((c) => c.includes("/ru/")));
  } finally {
    m.restore();
  }
});

test("scrape: 403 от сайта — сразу ошибка, без повторов и обхода (магазин блокирует, решение владельца: снять)", async () => {
  const m = mockFetch({ [SITEMAP]: [sitemap(A)], [A]: [403] });
  try {
    await assert.rejects(scrape(opts), /403/);
    assert.equal(m.calls.filter((c) => c === A).length, 1);
  } finally {
    m.restore();
  }
});

test("scrape: товар исчез (404) — в invalid; когда таких больше 5%, ошибка", async () => {
  const m = mockFetch({ [SITEMAP]: [sitemap(A, B)], [A]: [ibumetin] });
  try {
    await assert.rejects(scrape(opts), /1 из 2/);
  } finally {
    m.restore();
  }
});

test("scrape: пустой sitemap или мало товаров — ошибка, а не тихий успех", async () => {
  let m = mockFetch({ [SITEMAP]: [sitemap()] });
  try {
    await assert.rejects(scrape(opts), /sitemap/);
  } finally {
    m.restore();
  }
  m = mockFetch({ [SITEMAP]: [sitemap(A)], [A]: [ibumetin] });
  try {
    await assert.rejects(scrape({ ...opts, minProducts: 5 }), /ожидалось от 5/);
  } finally {
    m.restore();
  }
});

test("scrape: нет клубных плиток в /l/akcijas — ошибка, а не тихая потеря цен по карте", async () => {
  const m = mockFetch({ [SITEMAP]: [sitemap(A)], [A]: [ibumetin], [AKCIJAS]: ["<html>пусто</html>"] });
  try {
    await assert.rejects(scrape(opts), /akcijas/);
  } finally {
    m.restore();
  }
});
