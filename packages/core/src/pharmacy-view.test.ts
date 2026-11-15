import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_OFFERS, PAGE_SIZE } from "./offer-view";
import { cardActive, freshSince, groupMembers, parsePharmacyQuery, priceSummary, storeColor } from "./pharmacy-view";

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

test("freshSince: граница свежести данных — восемь дней назад (аптеки парсятся 3 раза в неделю, карточки Apotheka раз в неделю)", () => {
  assert.equal(freshSince(new Date("2026-11-12T12:00:00.000Z")), "2026-11-04T12:00:00.000Z");
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

const member = (id: number, price: number, group_id = 1) => ({ id, group_id, source_id: id, title: "t", price, old_price: null, discount: null, card_price: null, card_condition: null, card_starts_at: null, card_ends_at: null, prescription: false, url: null, image_url: null });

test("groupMembers: по номеру группы, от дешёвых", () => {
  const g = groupMembers([member(1, 9), member(2, 3), member(3, 5), member(4, 7, 2)]);
  assert.deepEqual(g.get(1)?.map((m) => m.id), [2, 3, 1]);
  assert.deepEqual(g.get(2)?.map((m) => m.id), [4]);
});

test("priceSummary: от и до, число аптек, разброс в процентах от самой дешёвой", () => {
  assert.deepEqual(priceSummary([{ price: 8.39, source_id: 1 }, { price: 9.7, source_id: 2 }, { price: 15.49, source_id: 3 }]), { min: 8.39, max: 15.49, count: 3, spreadPct: 85 });
});

test("priceSummary: одна аптека и одинаковые цены — разброса нет", () => {
  assert.deepEqual(priceSummary([{ price: 5, source_id: 1 }]), { min: 5, max: 5, count: 1, spreadPct: 0 });
  assert.equal(priceSummary([{ price: 5, source_id: 1 }, { price: 5, source_id: 2 }]).spreadPct, 0);
});

test("storeColor: цвет по slug аптеки, неизвестная аптека — серый", () => {
  assert.notEqual(storeColor("benu"), storeColor("apotheka"));
  assert.equal(storeColor("new-store"), storeColor(""));
});

test("priceSummary: аптек столько, сколько разных source_id (два товара одной аптеки в группе не удваивают счёт)", () => {
  assert.equal(priceSummary([{ price: 2, source_id: 1 }, { price: 4, source_id: 1 }, { price: 3, source_id: 2 }]).count, 2);
});
