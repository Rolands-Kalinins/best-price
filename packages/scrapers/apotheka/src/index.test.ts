import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseCard, parseList, productUrls, scrape } from "./index";

type Item = Record<string, any>;
// Записи списка /produkti и карточки, снятые 2026-11-01 (без лишних полей): акция, цена для зарегистрированных, обычный, нет в наличии, ОТС-лекарство.
const [sale, reg, plain, out, med] = JSON.parse(readFileSync("fixtures/list.json", "utf8")) as Item[];
// Карточки: товар не в наличии (TENA) и рецептурный препарат в наличии (omeprazole, тип Product+Drug).
const cardOut = readFileSync("fixtures/card-plain.html", "utf8");
const cardRx = readFileSync("fixtures/card-rx.html", "utf8");
const clone = <T>(x: T): T => structuredClone(x);

test("parseList: акция — цена, старая цена из <del>, ссылка, картинка, категория слагом без диакритики", () => {
  const { products, invalid } = parseList([sale]);
  assert.equal(invalid, 0);
  const p = products[0];
  assert.equal(p.externalId, "PMM0174017LV");
  assert.equal(p.title, "KLORANE SOS serums ar peonijām jūtīgai galvas ādai, 100ml");
  assert.equal(p.brand, "klorane");
  assert.equal(p.price, 9.08);
  assert.equal(p.oldPrice, 22.7);
  assert.equal(p.url, "https://www.apotheka.lv/klorane-sos-serums-ar-peonijam-jutigai-galvas-adai-100ml-pmm0174017lv");
  assert.match(p.imageUrl!, /^https:\/\/www\.apotheka\.lv\/media\//);
  assert.equal(p.category, "toniki/putas-matiem");
  assert.equal(p.inStock, true);
  assert.equal(p.prescription, false);
  assert.deepEqual([p.startsAt, p.endsAt, p.ean, p.cardPrice], [null, null, null, null]);
});

test("parseList: цена для зарегистрированных — cardPrice с условием, price остаётся обычной, старой цены нет", () => {
  const p = parseList([reg]).products[0];
  assert.equal(p.price, 27.1);
  assert.equal(p.oldPrice, null);
  assert.equal(p.cardPrice, 17.62);
  assert.equal(p.cardCondition, "Reģistrētiem lietotājiem");
  assert.deepEqual([p.cardStartsAt, p.cardEndsAt], [null, null]);
});

test("parseList: priceOld без <del> не старая цена (у обычных товаров он бывает выше или ниже текущей)", () => {
  const p = parseList([med]).products[0];
  assert.equal(p.price, 13.99);
  assert.equal(p.oldPrice, null);
  assert.equal(p.category, null);
  // isMedicine — ОТС и гомеопатия, не рецептурные (рецептурных в списках нет).
  assert.equal(p.prescription, false);
});

test("parseList: нет в наличии — inStock false; битый — invalid; повтор sku схлопывается", () => {
  const bad = clone(plain);
  bad.sku = "PMM0000001LV";
  bad.priceSimple = 0;
  const r = parseList([out, bad, plain, clone(plain)]);
  assert.equal(r.products.find((p) => p.externalId === out.sku)!.inStock, false);
  assert.equal(r.invalid, 1);
  assert.equal(r.products.length, 2);
});

test("parseCard: не в наличии — цена, штрихкод, бренд, картинка; без категории", () => {
  const p = parseCard(cardOut)!;
  assert.equal(p.externalId, "PMM0011254LV");
  assert.equal(p.title, "TENA Slip Plus autiņbikses, M izmērs, 30 gab.");
  assert.equal(p.brand, "tena");
  assert.equal(p.price, 22.44);
  assert.equal(p.ean, "7322540646726");
  assert.equal(p.inStock, false);
  assert.equal(p.prescription, false);
  assert.equal(p.category, null);
  assert.equal(p.url, "https://www.apotheka.lv/tena-slip-plus-autinbikses-m-izmers-30-gab-pmm0011254lv");
});

test("parseCard: рецептурный (тип Drug) помечается, в наличии", () => {
  const p = parseCard(cardRx)!;
  assert.equal(p.externalId, "PMM0107461LV");
  assert.equal(p.prescription, true);
  assert.equal(p.inStock, true);
  assert.equal(p.price, 5.49);
  assert.equal(p.ean, "04011548012789");
});

test("parseCard: нет ld+json с товаром или битая цена — null", () => {
  assert.equal(parseCard("<html>404</html>"), null);
  assert.equal(parseCard(cardOut.replace(/"price":\s*22\.44/, '"price": 0')), null);
});

test("productUrls: только страницы товаров (…-pmm…lv) из sitemap", () => {
  const xml = `<urlset><url><loc>https://www.apotheka.lv/</loc></url><url><loc>https://www.apotheka.lv/produkti/skaistums</loc></url>
<url><loc>https://www.apotheka.lv/tena-slip-pmm0011254lv</loc></url><url><loc>https://www.apotheka.lv/x-pmm0107461lv</loc></url></urlset>`;
  assert.deepEqual(productUrls(xml), ["https://www.apotheka.lv/tena-slip-pmm0011254lv", "https://www.apotheka.lv/x-pmm0107461lv"]);
});

// Подмена fetch: маршрутизация по адресу; число вместо тела — HTTP-статус.
const LIST = "https://www.apotheka.lv/produkti";
const listPage = (products: Item[], last: number, count: number) =>
  `<html><script type="application/json" data-ssr-config>${JSON.stringify({ products, paginationConfig: { lastPage: last }, pad: "x".repeat(1100) })}</script>"productsCount":${count}</html>`;
const sitemap = (...urls: string[]) => `<urlset>${urls.map((u) => `<url><loc>${u}</loc></url>`).join("")}</urlset>`;
function mockFetch(routes: Record<string, (string | number)[]>) {
  const real = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (url: string) => {
    calls.push(url);
    const r = routes[url]?.shift();
    if (r === undefined) return new Response("нет маршрута", { status: 404 });
    if (typeof r === "number") return new Response("err", { status: r });
    return new Response(r);
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = real) };
}
const opts = { retryMs: 0, pauseMs: 0, minProducts: 1 };
const SITEMAP = "https://www.apotheka.lv/sitemap_lv.xml";

test("scrape: список по страницам, потом карточки только тех, кого нет в списке; не в наличии отбрасывается", async () => {
  const m = mockFetch({
    [`${LIST}?p=1`]: [listPage([sale, reg], 2, 3)],
    [`${LIST}?p=2`]: [listPage([plain], 2, 3)],
    [SITEMAP]: [sitemap(sale.url, reg.url, plain.url, "https://www.apotheka.lv/omeprazole-stada-cps-20mg-n30-pmm0107461lv", "https://www.apotheka.lv/tena-slip-plus-autinbikses-m-izmers-30-gab-pmm0011254lv")],
    "https://www.apotheka.lv/omeprazole-stada-cps-20mg-n30-pmm0107461lv": [cardRx],
    "https://www.apotheka.lv/tena-slip-plus-autinbikses-m-izmers-30-gab-pmm0011254lv": [cardOut],
  });
  try {
    const { products } = await scrape(opts);
    assert.deepEqual(products.map((p) => p.externalId).sort(), ["PMM0010086LV", "PMM0107461LV", "PMM0174017LV", "PMM0192729LV"]);
    assert.equal(products.find((p) => p.externalId === "PMM0107461LV")!.prescription, true);
    // Карточки списочных товаров не читаем.
    assert.ok(!m.calls.includes(sale.url));
  } finally {
    m.restore();
  }
});

test("scrape: повторяет 429/500 для страницы списка", async () => {
  const m = mockFetch({ [`${LIST}?p=1`]: [429, 500, listPage([sale], 1, 1)], [SITEMAP]: [sitemap(sale.url)] });
  try {
    assert.equal((await scrape(opts)).products.length, 1);
  } finally {
    m.restore();
  }
});

test("scrape: карточка 404 (товар убрали) пропускается, другой сбой после повторов — ошибка", async () => {
  const gone = "https://www.apotheka.lv/gone-pmm0000002lv";
  const broken = "https://www.apotheka.lv/broken-pmm0000003lv";
  const routes = () => ({ [`${LIST}?p=1`]: [listPage([sale], 1, 1)], [SITEMAP]: [sitemap(sale.url, gone, broken)], [gone]: [404] });
  const m = mockFetch({ ...routes(), [broken]: [500, 500, 500, 500] });
  try {
    await assert.rejects(scrape(opts), /HTTP 500/);
  } finally {
    m.restore();
  }
  const m2 = mockFetch({ ...routes(), [broken]: [cardRx] });
  try {
    assert.equal((await scrape(opts)).products.length, 2);
  } finally {
    m2.restore();
  }
});

test("scrape: собрано меньше productsCount — ошибка, а не тихая потеря", async () => {
  const m = mockFetch({ [`${LIST}?p=1`]: [listPage([sale], 1, 50)], [SITEMAP]: [sitemap()] });
  try {
    await assert.rejects(scrape(opts), /1 из 50/);
  } finally {
    m.restore();
  }
});

test("scrape: нет встроенного JSON — ошибка формата", async () => {
  const m = mockFetch({ [`${LIST}?p=1`]: ["<html>другая вёрстка</html>"] });
  try {
    await assert.rejects(scrape(opts), /формат/);
  } finally {
    m.restore();
  }
});

test("scrape: товаров меньше ожидаемого минимума — ошибка", async () => {
  const m = mockFetch({ [`${LIST}?p=1`]: [listPage([sale], 1, 1)], [SITEMAP]: [sitemap(sale.url)] });
  try {
    await assert.rejects(scrape({ ...opts, minProducts: 5 }), /от 5/);
  } finally {
    m.restore();
  }
});
