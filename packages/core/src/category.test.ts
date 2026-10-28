import assert from "node:assert/strict";
import { test } from "node:test";
import { categorize, changedCategories, type Category } from "./category";

const CATS: Category[] = [
  { slug: "dairy", name: "Молочное", stems: ["piena", "^siers", "jogurt"] },
  { slug: "sweets", name: "Сладости", stems: ["sokolad", "konfek"] },
  { slug: "fish", name: "Рыба", stems: ["^ziv"] },
];

test("совпадение по подстроке, без регистра и диакритики", () => {
  assert.equal(categorize(CATS, "JOGURTS BALTAIS 380G"), "dairy");
  assert.equal(categorize(CATS, "Šokolāde Milka 95g"), "sweets");
});

test("«^» требует начала слова: «ziv» не находит «dzivnieku»", () => {
  assert.equal(categorize(CATS, "Zivju konservi"), "fish");
  assert.equal(categorize(CATS, "Dzīvnieku rotaļlieta"), null);
});

test("побеждает более длинное совпадение: «piena šokolāde» — сладости", () => {
  assert.equal(categorize(CATS, "Piena šokolāde Milka"), "sweets");
});

test("при равной длине побеждает категория выше в списке", () => {
  const cats: Category[] = [
    { slug: "a", name: "A", stems: ["abcd"] },
    { slug: "b", name: "B", stems: ["abcd"] },
  ];
  assert.equal(categorize(cats, "xx abcd"), "a");
});

test("ничего не нашлось — null", () => {
  assert.equal(categorize(CATS, "Adāmadatas 80cm"), null);
});

test("changedCategories: только изменившиеся, по категориям; без совпадения — other; категория магазина важнее названия", () => {
  const rows = [
    { id: 1, title: "Jogurts", category: null, cat: null },
    { id: 2, title: "Jogurts", category: null, cat: "dairy" }, // уже верно: не пишем
    { id: 3, title: "Rotaļlieta", category: "Šokolādes tāfelītes", cat: "dairy" }, // категория магазина решает
    { id: 4, title: "Rotaļlieta", category: null, cat: null },
    { id: 5, title: "Rotaļlieta", category: null, cat: "other" }, // уже other
    { id: 6, title: "Jogurts", category: "Konfekšu kārbas", cat: "dairy" }, // категория магазина главнее слов в названии (вкус не определяет товар)
    { id: 7, title: "Jogurts", category: "SH-10-1", cat: null }, // код без слов (Rimi): решает название
  ];
  assert.deepEqual([...changedCategories(CATS, rows)], [
    ["dairy", [1, 7]],
    ["sweets", [3, 6]],
    ["other", [4]],
  ]);
});
