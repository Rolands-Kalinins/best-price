import assert from "node:assert/strict";
import { test } from "node:test";
import { buildMatches, conditionKind, diffLinks, isSuspiciousRun, parseProduct, type MatchItem } from "./match";

const brands = new Set(["lays", "alma", "coca cola", "fanta", "jaunpils", "felix"]);
const p = (title: string, brand: string | null = null) => parseProduct(title, brand, brands);

test("Lays: тот же товар из двух магазинов даёт один ключ", () => {
  const a = p("Čipši Lays 180g Zaļo lociņu");
  const b = p("LAYS ČIPSI ZAĻO LOCIŅU 180G");
  assert.deepEqual(a, { brand: "lays", size: "180g", tokens: ["cipsi", "locinu", "zalo"] });
  assert.deepEqual(a, b);
});

test("жирность с запятой и пробелами равна записи через точку", () => {
  assert.deepEqual(p("Piens Alma lauku 3,6 - 4,2% 1l"), p("PIENS ALMA LAUKU 3.6-4.2% 1L"));
});

test("размер приводится к г или мл", () => {
  assert.equal(p("PIENS ALMA 2.5% 1.5L")?.size, "1500ml");
  assert.equal(p("Fanta 0,33L")?.size, "330ml");
  assert.equal(p("BARĪBA FELIX 85GX4")?.size, "340g");
  assert.equal(p("Siers Alma 2 x 500 g")?.size, "1000g");
  assert.equal(p("Cukurs 1 kg")?.size, "1000g");
  assert.equal(p("Zeķubikses Conte 3")?.size, null);
});

test("бренд из нескольких слов и бренд из поля магазина", () => {
  assert.equal(p("D DZĒRIENS COCA COLA GĀZ. 330ML CAN")?.brand, "coca cola");
  assert.equal(p("Dzēriens Coca-Cola 330ml")?.brand, "coca cola");
  assert.equal(p("Kaut kas Nezināms 100g", "NEZINĀMS")?.brand, "nezinams");
  assert.equal(p("Kaut kas 100g")?.brand, "");
});

test("акция на несколько товаров не разбирается", () => {
  assert.equal(p("Gāzēts dzēriens COCA-COLA, FANTA vai SPRITE, 330 ml, četri veidi"), null);
  assert.equal(p("Jogurts FANTASIA, 104 g vai 120 g, divi veidi"), null);
});

test("условие: карта не мешает, количество различает, смешанная покупка не сопоставляется", () => {
  assert.equal(conditionKind(null), "");
  assert.equal(conditionKind("Ar PALDIES karti"), "");
  assert.equal(conditionKind("Ar top! karti"), "");
  assert.equal(conditionKind("2 un vairāk"), "min2");
  assert.equal(conditionKind("Cena par 2 gab. (1 + 1)"), "set2");
  assert.equal(conditionKind("Ja liec grozā 2 · Cena par 2 gab."), "set2");
  assert.equal(conditionKind("Ar MansRimi karti · Cena par 2 gab."), "set2");
  assert.equal(conditionKind("Pērkot jebkuras 2 preces"), null);
  // Все условия, что есть в БД, кроме перечисленных выше.
  assert.equal(conditionKind("Ar Lidl Plus"), "");
  assert.equal(conditionKind("3 un vairāk"), "min3");
  assert.equal(conditionKind("Cena par 3 gab."), "set3");
  // Незнакомый текст не сопоставляется: «2+1» нельзя сравнивать с обычной ценой.
  assert.equal(conditionKind("2+1 bez maksas"), null);
});

test("diffLinks: привязывает новые, меняет изменившиеся, снимает выпавшие, не трогает прежние", () => {
  const current = [
    { id: 1, productId: null }, // новая в группе 10
    { id: 2, productId: 10 }, // без изменений
    { id: 3, productId: 10 }, // перешла в группу 11
    { id: 4, productId: 11 }, // выпала из групп
    { id: 5, productId: null }, // не в группах
  ];
  const r = diffLinks(current, new Map([[1, 10], [2, 10], [3, 11]]));
  assert.deepEqual([...r.toSet], [[10, [1]], [11, [3]]]);
  assert.deepEqual(r.toClear, [4]);
});

const item = (id: number, source: number, title: string, condition: string | null = null, brand: string | null = null): MatchItem =>
  ({ id, sourceId: source, title, brand, condition });

test("точное совпадение из двух магазинов объединяется, одиночный товар нет", () => {
  const r = buildMatches(
    [
      item(1, 1, "Čipši Lays 180g Zaļo lociņu"),
      item(2, 2, "LAYS ČIPSI ZAĻO LOCIŅU 180G"),
      item(3, 3, "Čipši Lays 90g Zaļo lociņu"),
    ],
    brands,
    [],
  );
  assert.deepEqual(r.groups.map((g) => g.offerIds), [[1, 2]]);
  assert.deepEqual(r.suggestions, []);
});

test("тот же товар в одном магазине дважды не считается сравнением", () => {
  const r = buildMatches([item(1, 1, "Čipši Lays 180g"), item(2, 1, "Lays čipši 180g")], brands, []);
  assert.deepEqual(r.groups, []);
});

test("разное количественное условие не объединяет", () => {
  const r = buildMatches([item(1, 1, "Piens Alma 1l", "2 un vairāk"), item(2, 2, "Piens Alma 1l")], brands, []);
  assert.deepEqual(r.groups, []);
});

test("карта магазина не мешает объединению", () => {
  const r = buildMatches([item(1, 1, "Piens Alma 1l", "Ar PALDIES karti"), item(2, 2, "Piens Alma 1l")], brands, []);
  assert.equal(r.groups.length, 1);
});

test("разный размер не объединяется даже без акций", () => {
  const r = buildMatches([item(1, 1, "Gāzēts dzēriens Fanta 2l"), item(2, 2, "Fanta 0,5l")], brands, []);
  assert.deepEqual(r.groups, []);
  assert.deepEqual(r.suggestions, []);
});

test("похожие, но не точные названия идут в предположения", () => {
  const items = [item(1, 1, "Graudainais biezpiens Alma 500g"), item(2, 2, "GRAUDAINAIS BIEZPIENS ALMA 7% 500G")];
  const r = buildMatches(items, brands, []);
  assert.deepEqual(r.groups, []);
  assert.equal(r.suggestions.length, 1);
  assert.deepEqual(r.suggestions[0].offerIds, [1, 2]);
});

test("разные вкусы одного бренда и размера не попадают в предположения", () => {
  const items = [item(1, 1, "Biezpiena sieriņš Alma ar mango 45g"), item(2, 2, "BIEZPIENA SIERIŅŠ ALMA BANĀNU 45G")];
  assert.deepEqual(buildMatches(items, brands, []).suggestions, []);
});

test("решение админа: «тот же» объединяет, «разные» убирает предположение", () => {
  const items = [item(1, 1, "Graudainais biezpiens Alma 500g"), item(2, 2, "GRAUDAINAIS BIEZPIENS ALMA 7% 500G")];
  const s = buildMatches(items, brands, []).suggestions[0];
  const same = buildMatches(items, brands, [{ keyA: s.keyA, keyB: s.keyB, same: true }]);
  assert.deepEqual(same.groups.map((g) => g.offerIds), [[1, 2]]);
  assert.equal(same.groups[0].key, s.keyA);
  // Склейка в обратном порядке решений даёт тот же ключ.
  assert.equal(buildMatches(items, brands, [{ keyA: s.keyB, keyB: s.keyA, same: true }]).groups[0].key, s.keyA);
  assert.deepEqual(same.suggestions, []);
  const diff = buildMatches(items, brands, [{ keyA: s.keyB, keyB: s.keyA, same: false }]);
  assert.deepEqual(diff.groups, []);
  assert.deepEqual(diff.suggestions, []);
});

test("убранная админом акция не участвует ни в группах, ни в предположениях", () => {
  const items = [
    item(1, 1, "Čipši Lays 180g Zaļo lociņu"),
    item(2, 2, "LAYS ČIPSI ZAĻO LOCIŅU 180G"),
    item(3, 3, "Čipši Lays 180g Zaļo lociņu"),
  ];
  assert.deepEqual(buildMatches(items, brands, [], new Set([3])).groups.map((g) => g.offerIds), [[1, 2]]);
  assert.deepEqual(buildMatches(items, brands, [], new Set([2, 3])).groups, []);
  const near = [item(1, 1, "Graudainais biezpiens Alma 500g"), item(2, 2, "GRAUDAINAIS BIEZPIENS ALMA 7% 500G")];
  assert.deepEqual(buildMatches(near, brands, [], new Set([2])).suggestions, []);
});

test("размер «gr» без пробела распознаётся", () => {
  assert.equal(p("Piens Alma 250gr")?.size, "250g");
  assert.equal(p("Piens Alma 250 gr")?.size, "250g");
  assert.equal(p("Grozs 5 grozs")?.size, null);
});

test("защита пересчёта: пустое или резко усечённое чтение не пишем", () => {
  assert.equal(isSuspiciousRun({ rows: 0, linkedBefore: 0, linkedAfter: 0 }), true);
  assert.equal(isSuspiciousRun({ rows: 1000, linkedBefore: 100, linkedAfter: 10 }), true);
  assert.equal(isSuspiciousRun({ rows: 1000, linkedBefore: 100, linkedAfter: 60 }), false);
  // малое число привязок: пересчёт может честно обнулить всё
  assert.equal(isSuspiciousRun({ rows: 50, linkedBefore: 10, linkedAfter: 0 }), false);
});
