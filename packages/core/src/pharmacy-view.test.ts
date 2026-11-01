import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_OFFERS, PAGE_SIZE } from "./offer-view";
import { cardActive, comparePrices, freshSince, groupByEan, parsePharmacyQuery } from "./pharmacy-view";

const q = (s: string) => parsePharmacyQuery(new URLSearchParams(s));

test("parsePharmacyQuery: значения по умолчанию и мусор заменяется ими", () => {
  assert.deepEqual(q(""), { q: "", store: null, cat: null, sale: false, card: false, sort: "discount", n: PAGE_SIZE });
  assert.deepEqual(q("store=abc&cat=nope&sort=x&n=zzz&sale=0&card=yes"), { q: "", store: null, cat: null, sale: false, card: false, sort: "discount", n: PAGE_SIZE });
});

test("parsePharmacyQuery: корректные параметры; категория только из словаря аптек, не из продуктового", () => {
  assert.deepEqual(q("q=vitamin&store=9&cat=supplements&sale=1&card=1&sort=price&n=120"), {
    q: "vitamin", store: 9, cat: "supplements", sale: true, card: true, sort: "price", n: 120,
  });
  assert.equal(q("cat=dairy").cat, null); // молочные есть у продуктов, у аптек нет
  assert.equal(q("sort=name").sort, "name");
});

test("parsePharmacyQuery: n ограничен страницей и потолком", () => {
  assert.equal(q("n=5").n, PAGE_SIZE);
  assert.equal(q("n=999999").n, MAX_OFFERS);
});

test("freshSince: граница свежести данных — три дня назад", () => {
  assert.equal(freshSince(new Date("2026-11-04T12:00:00.000Z")), "2026-11-01T12:00:00.000Z");
});

test("cardActive: цена по карте показывается в её сроки; без срока — пока есть цена", () => {
  const now = new Date("2026-11-10T12:00:00.000Z");
  const p = { card_price: 5, card_starts_at: null, card_ends_at: null };
  assert.equal(cardActive(p, now), true);
  assert.equal(cardActive({ ...p, card_ends_at: "2026-11-30T21:59:59.000Z" }, now), true);
  assert.equal(cardActive({ ...p, card_ends_at: "2026-11-01T21:59:00.000Z" }, now), false); // закончилась
  assert.equal(cardActive({ ...p, card_starts_at: "2026-11-20T00:00:00.000Z" }, now), false); // ещё не началась
  assert.equal(cardActive({ ...p, card_price: null }, now), false);
});

const row = (source_id: number, price: number, in_stock = true) => ({ ean: "1", source_id, price, in_stock, url: "https://x" });

test("comparePrices: другие аптеки по возрастанию цены, дешевле нас — cheaper, в наличии только", () => {
  const r = comparePrices({ source_id: 1, price: 10 }, [row(1, 10), row(2, 12), row(3, 8), row(4, 5, false)]);
  assert.deepEqual(r.others.map((o) => o.source_id), [3, 2]);
  assert.equal(r.cheaper?.source_id, 3);
});

test("comparePrices: мы самые дешёвые или других нет — cheaper пусто; равная цена не дешевле", () => {
  assert.equal(comparePrices({ source_id: 1, price: 10 }, [row(1, 10), row(2, 10), row(3, 12)]).cheaper, null);
  assert.deepEqual(comparePrices({ source_id: 1, price: 10 }, [row(1, 10)]).others, []);
  assert.deepEqual(comparePrices({ source_id: 1, price: 10 }, []).others, []);
});

test("groupByEan: строки раскладываются по штрихкоду", () => {
  const g = groupByEan([{ ...row(1, 1), ean: "a" }, { ...row(2, 2), ean: "a" }, { ...row(3, 3), ean: "b" }]);
  assert.equal(g.get("a")?.length, 2);
  assert.equal(g.get("b")?.length, 1);
});
