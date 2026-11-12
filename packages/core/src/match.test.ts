import assert from "node:assert/strict";
import { test } from "node:test";
import { abbrTokens, buildMatches, conditionKind, diffLinks, isSuspiciousRun, parseProduct, type MatchDecision, type MatchItem } from "./match";

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

// Сокращение с точкой («koc.», «mais.») совпадает с полным словом, если остальные слова те же. Реальные пары из очереди.
const abbrBrands = new Set(["boujee", "santa maria", "selga", "elmex", "colgate", "nivea", "old spice", "tri bio", "syoss", "paulig", "tiret"]);
const m = (items: MatchItem[], decisions: MatchDecision[] = []) => buildMatches(items, abbrBrands, decisions);

test("abbrTokens: слова с точкой после них; десятичная точка и размер не считаются", () => {
  assert.deepEqual([...abbrTokens("3D persiku saldējums uz koc. BOUJEE 75g")], ["koc"]);
  assert.deepEqual([...abbrTokens("Gāz.dz. Cola 1.5l, Tr.mazg.līdz. 2.5%")].sort(), ["dz", "gaz", "lidz", "mazg", "tr"]);
});

test("сокращение с точкой объединяется с полным словом (Maxima «koc.» и Barbora «kociņa»)", () => {
  const r = m([item(1, 2, "3D persiku saldējums uz koc. BOUJEE 75g", null), item(2, 5, "3D persiku saldējums uz kociņa BOUJEE 75g", null)]);
  assert.deepEqual(r.groups.map((g) => g.offerIds), [[1, 2]]);
  assert.deepEqual(r.suggestions, []);
});

test("сокращение в обе стороны и несколько сокращений сразу", () => {
  const r = m([item(1, 5, "Siera tako garšvielu maisījums SANTA MARIA 28g", null), item(2, 4, "Garšvielu mais. Santa Maria siera tako 28g", null)]);
  assert.equal(r.groups.length, 1);
  const v = m([item(1, 4, "Šampūns Nivea Men Strong Power vīrieš. 500ml", null), item(2, 5, "Šampūns NIVEA Men Strong Power vīriešiem 500ml", null)]);
  assert.equal(v.groups.length, 1);
});

test("без точки префикс не считается сокращением (White и Whitening разные)", () => {
  const r = m([item(1, 2, "Zobu pasta Colgate Total White 75ml", null), item(2, 5, "Zobu pasta Colgate Total Whitening 75ml", null)]);
  assert.deepEqual(r.groups, []);
});

test("окончания: citrona и citronu один вкус, а разные вкусы остаются разными", () => {
  const same = m([item(1, 2, "Mini vafeles Selga citrona garšu 250g", null), item(2, 5, "Mini vafeles Selga citronu garšu 250g", null)]);
  assert.equal(same.groups.length, 1);
  const diff = m([item(1, 2, "Mini vafeles Selga citronu garšu 250g", null), item(2, 5, "Mini vafeles Selga vaniļas garšu 250g", null)]);
  assert.deepEqual(diff.groups, []);
});

test("другое слово с тем же началом не окончание (Color и Colorist, Classic и Classico)", () => {
  const color = m([item(1, 2, "Šampūns Syoss Color 440ml", null), item(2, 5, "Šampūns Syoss Colorist 440ml", null)]);
  assert.deepEqual(color.groups, []);
});

test("лишнее слово не объединяется (Sensitive и Sensitive Gum Care остаются предположением)", () => {
  const r = m([item(1, 4, "Zobu pasta Elmex Sensitive 75ml", null), item(2, 5, "Zobu pasta Elmex Sensitive Gum Care 75ml", null)]);
  assert.deepEqual(r.groups, []);
});

test("решение админа «разные» сильнее правила сокращений", () => {
  const items = [item(1, 2, "3D persiku saldējums uz koc. BOUJEE 75g", null), item(2, 5, "3D persiku saldējums uz kociņa BOUJEE 75g", null)];
  // Те же две акции, но админ запретил именно эту пару ключей.
  const a = "boujee|75g||3 koc persiku saldejums uz";
  const b = "boujee|75g||3 kocina persiku saldejums uz";
  assert.deepEqual(m(items, [{ keyA: a, keyB: b, same: false }]).groups, []);
});

test("слова с общим началом без точки и окончания остаются разными (white и whitening, color и colorist, classic и classico, choc и chocominis)", () => {
  const pairs = [["White", "Whitening"], ["Color", "Colorist"], ["Classic", "Classico"], ["Choc", "Chocominis"]];
  for (const [x, y] of pairs) {
    const r = m([item(1, 2, `Zobu pasta Colgate ${x} 75ml`, null), item(2, 5, `Zobu pasta Colgate ${y} 75ml`, null)]);
    assert.deepEqual(r.groups, [], `${x}/${y}`);
  }
});

test("правило сокращений не склеивает через посредника ключи, которые админ развёл («разные»)", () => {
  // «Kaf» ≈ «kafija» по правилу, «kafija» ≈ «kafijas» по окончанию, но админ запретил пару kaf / kafijas.
  const items = [item(1, 2, "Kaf. Paulig Classic 500g", null), item(2, 5, "Kafija Paulig Classic 500g", null), item(3, 4, "Kafijas Paulig Classic 500g", null)];
  const kaf = "paulig|500g||classic kaf", kafs = "paulig|500g||classic kafijas";
  const r = m(items, [{ keyA: kaf, keyB: kafs, same: false }]);
  assert.equal(r.groups.length, 1);
  assert.deepEqual(r.groups[0].offerIds, [1, 2]); // 3 не попал в группу с 1
});

test("конфликты: решение «разные» внутри одной итоговой группы возвращаются списком", () => {
  const items = [item(1, 2, "Šampūns Syoss Repair 440ml", null), item(2, 5, "Šampūns Syoss Repair Plus 440ml", null), item(3, 4, "Šampūns Syoss Repair Max 440ml", null)];
  const a = "syoss|440ml||repair sampuns", b = "syoss|440ml||plus repair sampuns", c = "syoss|440ml||max repair sampuns";
  const r = m(items, [{ keyA: a, keyB: b, same: true }, { keyA: a, keyB: c, same: true }, { keyA: b, keyB: c, same: false }]);
  assert.deepEqual(r.conflicts, [{ keyA: c, keyB: b }]);
});
