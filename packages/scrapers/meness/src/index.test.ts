import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parse, scrape } from "./index";

type Item = Record<string, any>;
const fixture = JSON.parse(readFileSync("fixtures/products.json", "utf8")) as { meta: Item; data: Item[] };
const [sale, plain] = fixture.data;
const clone = <T>(x: T): T => structuredClone(x);

test("parse: товар с акцией — цена в центах, старая цена, срок по Риге, ссылка, картинка, категория меню сайта", () => {
  const { products, invalid } = parse([sale]);
  assert.equal(invalid, 0);
  const p = products[0];
  assert.equal(p.externalId, "1162270");
  assert.equal(p.title, "ALTERMED Panthenol Forte 9 % aerosols, 150 ml");
  assert.equal(p.brand, "ALTERMED");
  assert.equal(p.price, 6.59);
  assert.equal(p.oldPrice, 10.99);
  // 2026-10-01 00:00 по Риге летом (UTC+3) и 2026-11-01 23:59 зимой (UTC+2).
  assert.equal(p.startsAt, "2026-09-30T21:00:00.000Z");
  assert.equal(p.endsAt, "2026-11-01T21:59:00.000Z");
  assert.equal(p.url, `https://e-menessaptieka.lv/p/${sale.slug}-1162270`);
  assert.equal(p.imageUrl, `https://api.e-menessaptieka.lv/media/image/${sale.images[0].path}`);
  // В productTaxons деревья Moonmart и прочие; берём самый глубокий путь из меню магазина, при равенстве первый.
  assert.equal(p.category, "skaistumam/kermena-adas-kopsana/kremji-losjoni-un-ellas");
  assert.equal(p.prescription, false);
  assert.equal(p.inStock, true);
  assert.equal(p.ean, null);
});

test("parse: товар без акции — старой цены и срока нет", () => {
  const p = parse([plain]).products[0];
  assert.equal(p.price, 29.39);
  assert.equal(p.oldPrice, null);
  assert.equal(p.startsAt, null);
  assert.equal(p.endsAt, null);
  assert.equal(p.category, "vitamini-un-mineralvielas/mineralvielu-kompleksi/kolagens");
});

test("parse: нет веток верхнего меню — берём другую ветку магазина, а не служебные деревья (Moonmart, menessaptieka, mv-…)", () => {
  const p = clone(plain);
  p.productTaxons = ["menessaptieka/visas-preces", "moonmart-lv/visas-preces", "mv-higiena-un-veseliba/vate", "higienas-preces/vates-kocini", "higienas-preces", "moonmart"].map((slug) => ({ slug }));
  assert.equal(parse([p]).products[0].category, "higienas-preces/vates-kocini");
  p.productTaxons = [{ slug: "menessaptieka/visas-preces" }, { slug: "moonmart" }];
  assert.equal(parse([p]).products[0].category, null);
});

test("parse: цена по карте «Veselība» с периодом; у товара без неё поля пустые", () => {
  const c = clone(plain);
  Object.assign(c.defaultVariant.prices, { loyaltyCatalogPromotionPrice: 2500, loyaltyCatalogPromotionStartsAt: "2026-10-01 00:00:00", loyaltyCatalogPromotionEndsAt: "2026-11-01 23:59:00" });
  const p = parse([c]).products[0];
  assert.equal(p.price, 29.39);
  assert.equal(p.cardPrice, 25);
  assert.equal(p.cardCondition, "Ar karti «Veselība»");
  assert.equal(p.cardStartsAt, "2026-09-30T21:00:00.000Z");
  assert.equal(p.cardEndsAt, "2026-11-01T21:59:00.000Z");
  const none = parse([plain]).products[0];
  assert.deepEqual([none.cardPrice, none.cardCondition, none.cardStartsAt, none.cardEndsAt], [null, null, null, null]);
});

test("parse: рецептурный препарат помечается, а не отбрасывается", () => {
  const rx = clone(plain);
  rx.attributeValues.find((a: Item) => a.attribute.code === "receipt").value = true;
  assert.equal(parse([rx]).products[0].prescription, true);
});

test("parse: штрихкод берётся, если он есть; нет в наличии — inStock false", () => {
  const p = clone(plain);
  p.defaultVariant.barcode = "4751234567890";
  p.defaultVariant.inStock = false;
  const r = parse([p]).products[0];
  assert.equal(r.ean, "4751234567890");
  assert.equal(r.inStock, false);
});

test("parse: выключенный товар пропущен, битый посчитан в invalid", () => {
  const off = clone(plain);
  off.enabled = false;
  const bad = clone(plain);
  bad.code = "2";
  bad.defaultVariant.prices.price = 0;
  const r = parse([off, bad, plain]);
  assert.equal(r.products.length, 1);
  assert.equal(r.invalid, 1);
});

// Подмена fetch: pages — тела ответов по порядку, число — HTTP-статус.
function mockFetch(pages: (object | number)[]) {
  const real = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (url: string) => {
    calls.push(url);
    const r = pages.shift();
    if (typeof r === "number") return new Response("err", { status: r });
    return Response.json(r);
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = real) };
}
const page = (items: Item[], current: number, last: number, total: number) => ({ meta: { totalItems: total, currentPage: current, lastPage: last }, data: items });
const withCode = (code: string) => ({ ...clone(plain), code });
const opts = { retryMs: 0, pauseMs: 0, minProducts: 1, bands: [[0, 1000]] as [number, number][] };
// Первый запрос — общий счётчик каталога без фильтров, дальше страницы диапазона.
const probe = (total: number) => page([], 1, 1, total);

test("scrape: обходит страницы диапазона по lastPage и повторяет сбой 500", async () => {
  const m = mockFetch([probe(3), page([withCode("1"), withCode("2")], 1, 2, 3), 500, page([withCode("3")], 2, 2, 3)]);
  try {
    const { products } = await scrape(opts);
    assert.deepEqual(products.map((p) => p.externalId), ["1", "2", "3"]);
    assert.ok(m.calls[0].includes("itemsPerPage=1") && !m.calls[0].includes("price"));
    assert.ok(m.calls[1].includes("itemsPerPage=100&page=1&price[min]=0&price[max]=1000"));
    assert.ok(m.calls[3].includes("page=2"));
  } finally {
    m.restore();
  }
});

test("scrape: серия из четырёх обрывов подряд на одной странице переживается (на раннерах GitHub сайт рвёт соединение, 11–12.11 падало с «terminated»)", async () => {
  const m = mockFetch([probe(1), 500, 500, 500, 500, page([withCode("1")], 1, 1, 1)]);
  try {
    assert.equal((await scrape(opts)).products.length, 1);
  } finally {
    m.restore();
  }
});

test("scrape: диапазоны обходятся по очереди, повтор на стыке убирается", async () => {
  const m = mockFetch([probe(3), page([withCode("1"), withCode("2")], 1, 1, 2), page([withCode("2"), withCode("3")], 1, 1, 2)]);
  try {
    const { products } = await scrape({ ...opts, bands: [[0, 500], [500, 1000]] });
    assert.deepEqual(products.map((p) => p.externalId), ["1", "2", "3"]);
    assert.ok(m.calls[2].includes("price[min]=500&price[max]=1000"));
  } finally {
    m.restore();
  }
});

test("scrape: диапазон отдал меньше, чем в его счётчике — ошибка, а не тихая потеря", async () => {
  const m = mockFetch([probe(10), page([withCode("1")], 1, 1, 10)]);
  try {
    await assert.rejects(scrape(opts), /1 из 10/);
  } finally {
    m.restore();
  }
});

test("scrape: диапазоны не покрыли каталог (товар вне диапазонов) — ошибка", async () => {
  const m = mockFetch([probe(100), page([withCode("1")], 1, 1, 1)]);
  try {
    await assert.rejects(scrape(opts), /1 из 100/);
  } finally {
    m.restore();
  }
});

test("scrape: неожиданный формат ответа — ошибка", async () => {
  const m = mockFetch([{ items: [] }]);
  try {
    await assert.rejects(scrape(opts), /формат/);
  } finally {
    m.restore();
  }
});
