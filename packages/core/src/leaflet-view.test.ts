import assert from "node:assert/strict";
import { test } from "node:test";
import { cropStyle, groupPages, ownPeriod, siteOffers, type LeafletRow } from "./leaflet-view";

const row = (o: Partial<LeafletRow>): LeafletRow => ({
  id: 1, source_id: 1, flyer_id: "f", page: 1, external_id: "x", title: "t", brand: null, packaging: null, price: 1, old_price: null, price_card: null,
  discount_percent: null, unit_price: null, unit: null, condition: null, starts_at: "2026-10-25T22:00:00Z", ends_at: "2026-11-01T21:59:59Z",
  url: "https://www.lidl.lv/l/lv/akciju-buklets/a/view/flyer/page/1", price_second: null, photo_box: null, page_image_url: "https://imgproxy.leaflets.schwarz/p1", last_seen_at: "2026-10-31T00:00:00Z", ...o,
});

test("groupPages: страницы по порядку, строки внутри по id, сквозной номер с 1 по всему буклету", () => {
  const pages = groupPages([row({ id: 9, page: 40, title: "c" }), row({ id: 5, page: 1, title: "b" }), row({ id: 2, page: 1, title: "a" })]);
  assert.deepEqual(pages.map((p) => p.page), [1, 40]);
  assert.deepEqual(pages[0].rows.map((r) => [r.n, r.title]), [[1, "a"], [2, "b"]]);
  assert.deepEqual(pages[1].rows.map((r) => [r.n, r.title]), [[3, "c"]]);
  assert.equal(groupPages([]).length, 0);
});

test("groupPages: картинка и ссылка страницы берутся из первой строки с ними; не http(s) — null (в базе чужие данные)", () => {
  const [p] = groupPages([row({ id: 1, page_image_url: null }), row({ id: 2 })]);
  assert.equal(p.imageUrl, "https://imgproxy.leaflets.schwarz/p1");
  assert.equal(p.url, "https://www.lidl.lv/l/lv/akciju-buklets/a/view/flyer/page/1");
  const [bad] = groupPages([row({ page_image_url: "javascript:alert(1)", url: "data:text/html,x" })]);
  assert.equal(bad.imageUrl, null);
  assert.equal(bad.url, null);
});

test("ownPeriod: срок плитки совпал со сроком буклета — null; иначе «с», «до» или «с–до» по Риге", () => {
  const flyer = { starts_at: "2026-10-25T22:00:00Z", ends_at: "2026-11-01T21:59:59Z" }; // 26.10 — 01.11 по Риге
  assert.equal(ownPeriod(row({}), flyer), null);
  assert.equal(ownPeriod(row({ ends_at: "2026-10-28T21:59:59Z" }), flyer), "до 28.10");
  assert.equal(ownPeriod(row({ starts_at: "2026-10-28T22:00:00Z" }), flyer), "с 29.10");
  assert.equal(ownPeriod(row({ starts_at: "2026-10-30T22:00:00Z", ends_at: "2026-11-01T21:59:59Z" }), flyer), "с 31.10");
  assert.equal(ownPeriod(row({ starts_at: "2026-10-26T22:00:00Z", ends_at: "2026-10-29T21:59:59Z" }), flyer), "27.10–29.10");
});

test("cropStyle: рамка 200×100 из 1000 → картинка в 5 раз шире контейнера, сдвинута на левый верхний угол рамки", () => {
  const c = cropStyle([500, 100, 600, 300]);
  assert.deepEqual(c.img, { width: "500%", left: "-50%", top: "-500%" });
  assert.equal(c.box.aspectRatio, "1.2008");
});

test("siteOffers: цена по карте становится ценой акции (обычная — «было»), условие «Lidl Plus», цена за кг считается заново", () => {
  const [o] = siteOffers([row({ title: "PILOS Ayran", packaging: "250 ml", price: 0.59, price_card: 0.45, discount_percent: 24, condition: null })]);
  assert.deepEqual([o.price, o.old_price, o.condition, o.unit_price, o.unit, o.discount_percent], [0.45, 0.59, "Lidl Plus", 1.8, "l", null]);
  assert.equal(siteOffers([row({ price_card: 0.45, condition: "Ar Lidl Plus" })])[0].condition, "Ar Lidl Plus");
});

test("siteOffers: обычная акция без изменений; фото — наша миниатюра /grocery/img/<магазин>/<ключ>, если есть рамка; ссылки на буклет нет", () => {
  const [a, b] = siteOffers([
    row({ external_id: "a1", price: 1.89, old_price: 2.49, discount_percent: 24, photo_box: [10, 20, 300, 400] }),
    row({ external_id: "b2", title: "b", photo_box: null }),
  ]);
  assert.deepEqual([a.price, a.old_price, a.discount_percent, a.condition, a.image_url, a.url], [1.89, 2.49, 24, null, "/grocery/img/1/a1", null]);
  assert.equal(b.image_url, null);
});

test("siteOffers: без цены и процента («2+1») пропускается; скидка на категорию остаётся; дубль (тот же товар и цены на другой странице) склеивается", () => {
  const out = siteOffers([
    row({ external_id: "1", title: "FIN CARRE", price: null, discount_percent: null, condition: "2+1" }),
    row({ external_id: "2", title: "Bellarom", price: null, discount_percent: 30 }),
    row({ external_id: "3", title: "Burkāni", packaging: "1 kg", price: 0.49, page: 14 }),
    row({ external_id: "4", title: "BURKĀNI", packaging: "1 kg", price: 0.49, page: 36 }),
    row({ external_id: "5", title: "Burkāni", packaging: "1 kg", price: 0.59, page: 37 }),
  ]);
  assert.deepEqual(out.map((o) => o.external_id), ["2", "3", "5"]);
});

test("siteOffers: цена второго товара уходит в условие, цена акции — за один товар, цена по карте не подменяет её", () => {
  const [o] = siteOffers([row({ title: "Coca-Cola", packaging: "1 l", price: 1.32, price_second: 0.46, condition: "2. precei ar Lidl Plus" })]);
  assert.deepEqual([o.price, o.old_price, o.discount_percent, o.condition], [1.32, null, null, "2. precei ar Lidl Plus: 0,46 €"]);
  assert.equal(siteOffers([row({ price: 1.32, price_second: 0.46 })])[0].condition, "2. prece: 0,46 €");
});
