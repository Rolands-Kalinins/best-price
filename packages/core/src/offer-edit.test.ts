import assert from "node:assert/strict";
import { test } from "node:test";
import { parseOfferEdit, type EditableOffer } from "./offer-edit";

const cur: EditableOffer = {
  title: "PILOS Skābpiena dzēriens Ayran", brand: "Pilos", packaging: "250 ml", condition: null, price: 0.59, old_price: null, discount_percent: 24,
  ends_at: "2026-11-01T21:59:59+00:00", image_url: "https://x.test/a.jpg", locked_fields: [],
};
const form = (o: Record<string, string> = {}) => ({
  title: cur.title, brand: "Pilos", packaging: "250 ml", condition: "", price: "0,59", old_price: "", discount_percent: "24", ends_at: "2026-11-01", image_url: "https://x.test/a.jpg", ...o,
});

test("parseOfferEdit: без изменений — пустой список закреплённых, поля те же", () => {
  const r = parseOfferEdit(form(), cur);
  assert.ok(r.ok);
  assert.deepEqual(r.locked, []);
  assert.equal(r.patch.price, 0.59);
  assert.equal(r.patch.ends_at, cur.ends_at); // дата та же (по Риге): срок не трогаем
});

test("parseOfferEdit: изменённые поля закрепляются от перезаписи парсером, ранее закреплённые остаются", () => {
  const r = parseOfferEdit(form({ title: "Ayran PILOS", condition: " Lidl Plus ", price: "0.45", old_price: "0,59" }), { ...cur, locked_fields: ["image_url"] });
  assert.ok(r.ok);
  assert.deepEqual([...r.locked].sort(), ["condition", "image_url", "old_price", "price", "title", "unit", "unit_price"].sort());
  assert.deepEqual([r.patch.title, r.patch.condition, r.patch.price, r.patch.old_price], ["Ayran PILOS", "Lidl Plus", 0.45, 0.59]);
});

test("parseOfferEdit: цена за кг/л пересчитывается из цены и объёма", () => {
  const r = parseOfferEdit(form({ price: "0,45" }), cur);
  assert.ok(r.ok);
  assert.deepEqual([r.patch.unit_price, r.patch.unit], [1.8, "l"]);
});

test("parseOfferEdit: ошибки — пустое название, цена не число или ≤ 0, было не выше цены, процент вне 1–100, нет ни цены ни процента, плохая ссылка и дата", () => {
  for (const bad of [{ title: "  " }, { price: "abc" }, { price: "0" }, { price: "20000" }, { price: "1", old_price: "1" }, { discount_percent: "0" }, { discount_percent: "101" }, { discount_percent: "5.5" }, { price: "", discount_percent: "" }, { image_url: "javascript:alert(1)" }, { ends_at: "31.10.2026" }]) {
    assert.equal(parseOfferEdit(form(bad), cur).ok, false, JSON.stringify(bad));
  }
});

test("parseOfferEdit: пустые необязательные поля — null; срок — конец дня по Риге; наша миниатюра в image_url разрешена", () => {
  const r = parseOfferEdit(form({ brand: "", packaging: "", ends_at: "2026-11-05", image_url: "/grocery/img/1/ab12" }), cur);
  assert.ok(r.ok);
  assert.deepEqual([r.patch.brand, r.patch.packaging, r.patch.unit_price, r.patch.ends_at, r.patch.image_url], [null, null, null, "2026-11-05T21:59:59.000Z", "/grocery/img/1/ab12"]);
});
