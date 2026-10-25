import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parse } from "./index";

test("parse: фикстура с четырьмя плитками", () => {
  const { offers, invalid } = parse(readFileSync("fixtures/grid.html", "utf8"));
  assert.equal(invalid, 0);
  const by = Object.fromEntries(offers.map((o) => [o.externalId, o]));

  // Только цена Lidl Plus: условие, старая цена из oldPrice, цена за кг по фасовке.
  assert.equal(by["11477305"].price, 2.89);
  assert.equal(by["11477305"].oldPrice, 3.89);
  assert.equal(by["11477305"].condition, "Ar Lidl Plus");
  assert.equal(by["11477305"].unitPrice, 19.27);
  assert.equal(by["11477305"].endsAt, "2026-10-25T21:59:59.000Z");

  // Обычная цена: старая цена из discount.deletedPrice, без условия.
  assert.equal(by["11029564"].oldPrice, 0.59);
  assert.equal(by["11029564"].condition, null);
  assert.equal(by["11029564"].unit, "kg");

  // Штучный товар: цены за единицу нет, товар цел.
  assert.equal(by["11314475"].unitPrice, null);
  assert.equal(by["11314475"].oldPrice, null);
  assert.ok(by["11314475"].url.startsWith("https://www.lidl.lv/p/"));
});
