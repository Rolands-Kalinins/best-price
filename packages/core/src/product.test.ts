import assert from "node:assert/strict";
import { test } from "node:test";
import { productSchema, uniqueProducts } from "./product";

const base = {
  externalId: "1142669", title: "NATEO D 4000 kapsulas, 60 gab.", brand: "NATEO", packaging: null, price: 8.99, oldPrice: 16.29,
  startsAt: null, endsAt: null, ean: null, url: "https://e-menessaptieka.lv/p/x-1142669", imageUrl: null,
  category: "vitamini-un-mineralvielas/vitamini", prescription: false, inStock: true,
};

test("productSchema: цена обязательна, рецептурность и наличие заданы явно", () => {
  assert.ok(productSchema.safeParse(base).success);
  assert.ok(!productSchema.safeParse({ ...base, price: null }).success);
  assert.ok(!productSchema.safeParse({ ...base, price: 0 }).success);
  const { prescription, ...noRx } = base;
  assert.ok(!productSchema.safeParse(noRx).success);
});

test("productSchema: старая цена не выше текущей отбрасывается, товар остаётся", () => {
  assert.equal(productSchema.parse({ ...base, oldPrice: 8.99 }).oldPrice, null);
  assert.equal(productSchema.parse({ ...base, oldPrice: 5 }).oldPrice, null);
  assert.equal(productSchema.parse(base).oldPrice, 16.29);
});

test("productSchema: цена по карте необязательна и по умолчанию пуста", () => {
  const p = productSchema.parse(base);
  assert.deepEqual([p.cardPrice, p.cardCondition, p.cardStartsAt, p.cardEndsAt], [null, null, null, null]);
  const c = productSchema.parse({ ...base, cardPrice: 5.5, cardCondition: "Karte «Veselība»", cardStartsAt: "2026-10-01T00:00:00.000Z", cardEndsAt: "2026-11-01T21:59:00.000Z" });
  assert.equal(c.cardPrice, 5.5);
  assert.equal(c.cardCondition, "Karte «Veselība»");
});

test("productSchema: цена по карте не ниже обычной бессмысленна — убирается вместе с условием, товар остаётся", () => {
  for (const cardPrice of [8.99, 12]) {
    const p = productSchema.parse({ ...base, cardPrice, cardCondition: "x" });
    assert.equal(p.cardPrice, null);
    assert.equal(p.cardCondition, null);
  }
  assert.ok(!productSchema.safeParse({ ...base, cardPrice: 0 }).success);
});

test("uniqueProducts: повтор externalId убирается", () => {
  const a = productSchema.parse(base);
  assert.equal(uniqueProducts([a, a, { ...a, externalId: "2" }]).length, 2);
});
