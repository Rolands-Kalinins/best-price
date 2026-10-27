import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parse, scrape } from "./index";

const fixture = JSON.parse(readFileSync("fixtures/search.json", "utf8"));

test("parse: фикстура с тремя товарами из API", () => {
  const { offers, invalid } = parse(fixture.items);
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

test("parse: битый товар считается в invalid, остальные целы", () => {
  const { offers, invalid } = parse([...fixture.items, { gridbox: { data: {} } }]);
  assert.equal(offers.length, 3);
  assert.equal(invalid, 1);
});

test("scrape: листает API до numFound", async () => {
  const [a, b, c] = fixture.items;
  const pages = [[a, b], [c], []];
  const urls: string[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    urls.push(url);
    return Response.json({ numFound: 3, items: pages[urls.length - 1] });
  }) as typeof fetch;
  try {
    const { offers } = await scrape();
    assert.equal(offers.length, 3);
    assert.equal(urls.length, 2); // третий запрос не нужен: 2 + 1 = numFound
    assert.match(urls[1], /offset=2/);
  } finally {
    globalThis.fetch = real;
  }
});
