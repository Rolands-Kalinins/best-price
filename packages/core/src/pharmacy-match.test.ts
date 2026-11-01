import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeBrand } from "./match";
import { groupProducts, pharmacyMatchKey } from "./pharmacy-match";

const brands = new Set(["xymelin", "woom", "lyl", "oralflux", "gastroval", "nurofen", "tena"].map(normalizeBrand));
const key = (title: string, brand: string | null = null) => pharmacyMatchKey(title, brand, brands);

test("pharmacyMatchKey: одно и то же название в разных аптеках даёт один ключ (регистр, ®, запятые, порядок слов)", () => {
  const a = key("XYMELIN Menthol 1 mg/ml deguna aerosols, 10 ml");
  assert.ok(a);
  assert.equal(key("XYMELIN® Menthol 1 mg/ml deguna aerosols, 10 ml"), a);
  assert.equal(key("XYMELIN MENTHOL 1 mg/ml deguna aerosols, 10 ml"), a);
  assert.equal(key("WOOM Ultra Soft Rozā zobu birste, 1 gab."), key("WOOM zobu birste ULTRA SOFT, rozā, 1 gab."));
});

test("pharmacyMatchKey: число штук N30 и «30 gab» — одно и то же, а 30 и 60 — разные товары", () => {
  assert.equal(key("GASTROVAL Fluxus kapsulas N15"), key("GASTROVAL Fluxus kapsulas, 15 gab."));
  assert.notEqual(key("GASTROVAL Fluxus kapsulas, 15 gab."), key("GASTROVAL Fluxus kapsulas, 30 gab."));
});

test("pharmacyMatchKey: другая доза или размер — другой ключ", () => {
  assert.notEqual(key("NUROFEN tabletes 200 mg N24"), key("NUROFEN tabletes 400 mg N24"));
  assert.notEqual(key("ORALFLUX mutes skalojamais līdzeklis 500 ml"), key("ORALFLUX mutes skalojamais līdzeklis 250 ml"));
  assert.notEqual(key("XYMELIN deguna aerosols 0.05% 10 ml"), key("XYMELIN deguna aerosols 0.1% 10 ml"));
});

test("pharmacyMatchKey: нет бренда, набор «vai» или нет ничего кроме бренда — не сопоставляем", () => {
  assert.equal(key("Zobu birste mīksta, 1 gab."), null);
  assert.equal(key("TENA vai WOOM, dažādi veidi"), null);
  assert.equal(key("TENA"), null);
});

const item = (id: number, sourceId: number, price: number, o: Partial<{ ean: string | null; key: string | null; inStock: boolean }> = {}) => ({ id, sourceId, ean: null, key: null, price, inStock: true, ...o });

test("groupProducts: один штрихкод или один ключ — одна группа; cheapest в наличии — rep", () => {
  const g = groupProducts([item(1, 1, 9, { ean: "e" }), item(2, 2, 7, { ean: "e" }), item(3, 3, 8, { key: "k" }), item(4, 4, 6, { key: "k" })]);
  assert.deepEqual(g.get(1), { groupId: 1, rep: false });
  assert.deepEqual(g.get(2), { groupId: 1, rep: true });
  assert.deepEqual(g.get(3), { groupId: 3, rep: false });
  assert.deepEqual(g.get(4), { groupId: 3, rep: true });
});

test("groupProducts: штрихкод и ключ связывают через третий товар; одна аптека или одиночка — без группы", () => {
  const g = groupProducts([item(1, 1, 5, { ean: "e" }), item(2, 2, 6, { ean: "e", key: "k" }), item(3, 3, 7, { key: "k" }), item(4, 1, 1, { key: "z" }), item(5, 1, 2, { key: "z" }), item(6, 2, 3)]);
  assert.equal(new Set([1, 2, 3].map((id) => g.get(id)?.groupId)).size, 1);
  assert.equal(g.get(1)?.groupId, 1);
  for (const id of [4, 5, 6]) assert.equal(g.has(id), false);
});

test("groupProducts: rep — самый дешёвый из тех, что в наличии (ничья — меньший id); никого в наличии — самый дешёвый из всех", () => {
  const a = groupProducts([item(1, 1, 5, { ean: "e", inStock: false }), item(2, 2, 9, { ean: "e" }), item(3, 3, 9, { ean: "e" })]);
  assert.deepEqual([1, 2, 3].map((id) => a.get(id)?.rep), [false, true, false]);
  const b = groupProducts([item(7, 1, 5, { ean: "e", inStock: false }), item(8, 2, 3, { ean: "e", inStock: false })]);
  assert.deepEqual([7, 8].map((id) => b.get(id)?.rep), [false, true]);
});
