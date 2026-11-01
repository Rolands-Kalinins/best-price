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

test("uniqueProducts: повтор externalId убирается", () => {
  const a = productSchema.parse(base);
  assert.equal(uniqueProducts([a, a, { ...a, externalId: "2" }]).length, 2);
});
