import assert from "node:assert/strict";
import { test } from "node:test";
import { offerSchema, uniqueOffers, unitPrice } from "./offer";

const base = {
  externalId: "1", title: "Saldumiem MILKA", brand: "MILKA", packaging: null, price: null, oldPrice: null,
  unitPrice: null, unit: null, condition: null, startsAt: null, endsAt: null, ean: null,
  url: "https://www.maxima.lv/piedavajumi", imageUrl: null, category: null,
};

test("offerSchema: нужна цена или процент скидки на бренд/категорию", () => {
  assert.ok(offerSchema.safeParse({ ...base, discountPercent: 30 }).success);
  assert.ok(offerSchema.safeParse({ ...base, price: 1.19 }).success);
  // discountPercent необязателен: парсеры с обычной ценой (Lidl) его не задают
  assert.equal(offerSchema.parse({ ...base, price: 1.19 }).discountPercent, null);
  assert.ok(!offerSchema.safeParse(base).success);
  assert.ok(!offerSchema.safeParse({ ...base, discountPercent: 0 }).success);
  assert.ok(!offerSchema.safeParse({ ...base, discountPercent: 101 }).success);
  assert.ok(!offerSchema.safeParse({ ...base, discountPercent: 12.5 }).success);
});

test("unitPrice", () => {
  assert.deepEqual(unitPrice(2.89, "150 g"), { unitPrice: 19.27, unit: "kg" });
  assert.deepEqual(unitPrice(3.49, "1 l"), { unitPrice: 3.49, unit: "l" });
  assert.deepEqual(unitPrice(16.99, "8 x 125 g"), { unitPrice: 16.99, unit: "kg" });
  assert.deepEqual(unitPrice(5.79, "gab. 250 g"), { unitPrice: 23.16, unit: "kg" });
  assert.deepEqual(unitPrice(1, "500 ml"), { unitPrice: 2, unit: "l" });
  assert.equal(unitPrice(1.59, "10 gab."), null);
  assert.equal(unitPrice(1.49, null), null);
});

test("offerSchema: старая цена не выше новой отбрасывается, сама акция остаётся", () => {
  assert.equal(offerSchema.parse({ ...base, price: 1.5, oldPrice: 2 }).oldPrice, 2);
  assert.equal(offerSchema.parse({ ...base, price: 1.5, oldPrice: 1.5 }).oldPrice, null);
  assert.equal(offerSchema.parse({ ...base, price: 1.5, oldPrice: 0.9 }).oldPrice, null);
  // скидка на бренд без цены: старой цены нет и сравнивать не с чем
  assert.equal(offerSchema.parse({ ...base, discountPercent: 30, oldPrice: 5 }).oldPrice, 5);
});

test("uniqueOffers: повтор externalId отбрасывается, первый остаётся, порядок сохраняется", () => {
  const o = (externalId: string, title: string) => offerSchema.parse({ ...base, price: 1, externalId, title });
  const out = uniqueOffers([o("1", "a"), o("2", "b"), o("1", "c")]);
  assert.deepEqual(out.map((x) => x.title), ["a", "b"]);
});
