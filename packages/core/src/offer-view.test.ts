import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { activeFilter, discountPercent, offerDiscount, parseQuery, priceGap, SEARCH_FROM, SEARCH_TO, safeHttpUrl, searchTerms, storePrices } from "./offer-view";

test("safeHttpUrl: только http(s)", () => {
  assert.equal(safeHttpUrl("https://www.lidl.lv/p/1"), "https://www.lidl.lv/p/1");
  assert.equal(safeHttpUrl("http://x.lv/a"), "http://x.lv/a");
  assert.equal(safeHttpUrl("javascript:alert(1)"), null);
  assert.equal(safeHttpUrl("data:text/html,<script>1</script>"), null);
  assert.equal(safeHttpUrl("/relative"), null);
  assert.equal(safeHttpUrl(""), null);
  assert.equal(safeHttpUrl(null), null);
});

test("discountPercent: целые проценты, скидки нет — null", () => {
  assert.equal(discountPercent(1.5, 2), 25);
  assert.equal(discountPercent(1.99, 2.49), 20);
  assert.equal(discountPercent(2, 2), null);
  assert.equal(discountPercent(2, 1), null);
  assert.equal(discountPercent(1, null), null);
  // меньше 1% не показываем «−0%»
  assert.equal(discountPercent(9.99, 10), null);
});

test("offerDiscount: процент скидки на бренд важнее расчёта по старой цене", () => {
  assert.equal(offerDiscount({ price: null, old_price: null, discount_percent: 30 }), 30);
  assert.equal(offerDiscount({ price: 3, old_price: 4, discount_percent: null }), 25);
  assert.equal(offerDiscount({ price: 3, old_price: null, discount_percent: null }), null);
  assert.equal(offerDiscount({ price: null, old_price: null, discount_percent: null }), null);
});

test("parseQuery: значения по умолчанию и мусор", () => {
  const def = { q: "", store: null, cond: false, scope: false, sort: "discount", n: 60 };
  assert.deepEqual(parseQuery(new URLSearchParams("")), def);
  assert.deepEqual(parseQuery(new URLSearchParams("sort=хаос&store=abc&cond=yes&scope=да")), def);
  assert.deepEqual(parseQuery(new URLSearchParams("store=0")), def);
  assert.deepEqual(parseQuery(new URLSearchParams("store=-3")), def);
  assert.deepEqual(parseQuery(new URLSearchParams("q=pienas&store=2&cond=1&scope=1&sort=price")), {
    q: "pienas",
    store: 2,
    cond: true,
    scope: true,
    sort: "price",
    n: 60,
  });
  // Лимит: не меньше страницы, не больше 1000, мусор — страница.
  assert.equal(parseQuery(new URLSearchParams("n=180")).n, 180);
  assert.equal(parseQuery(new URLSearchParams("n=5")).n, 60);
  assert.equal(parseQuery(new URLSearchParams("n=99999")).n, 1000);
  assert.equal(parseQuery(new URLSearchParams("n=abc")).n, 60);
});

test("searchTerms: без регистра и диакритики, по словам", () => {
  assert.deepEqual(searchTerms("  Šokolāde   PIENS "), ["sokolade", "piens"]);
  assert.deepEqual(searchTerms("Ķirbis Žāvēti"), ["kirbis", "zaveti"]);
  assert.deepEqual(searchTerms("Сыр Gouda"), ["сыр", "gouda"]); // кириллицу не трогаем: как в translate() столбца search
  assert.deepEqual(searchTerms("   "), []);
  // Маски like (% _ \ и * в PostgREST) в слове не работают как маски: экранирование через API не срабатывает, поэтому они просто убираются.
  assert.deepEqual(searchTerms("50% a_b c\\d *"), ["50", "a", "b", "c", "d"]);
});

test("activeFilter: действующие по дате, без даты — только если товар виден в последних запусках", () => {
  const now = new Date("2026-10-27T12:00:00.000Z");
  assert.equal(
    activeFilter(now),
    "ends_at.gt.2026-10-27T12:00:00.000Z,and(ends_at.is.null,last_seen_at.gt.2026-10-24T12:00:00.000Z)",
  );
});

test("замены поиска в JS и в миграции offers_scale совпадают", () => {
  const sql = readFileSync("../../supabase/migrations/20261027120000_offers_scale.sql", "utf8");
  assert.ok(sql.includes(`translate(title || ' ' || coalesce(brand, ''), '${SEARCH_FROM}', '${SEARCH_TO}')`));
  assert.equal([...SEARCH_FROM].length, SEARCH_TO.length);
});

test("storePrices: одна самая дешёвая акция на магазин, по возрастанию, без цены отбрасывается", () => {
  const r = storePrices([
    { id: 1, source_id: 1, price: 1.5 },
    { id: 2, source_id: 1, price: 1.2 },
    { id: 3, source_id: 2, price: 1.0 },
    { id: 4, source_id: 3, price: null },
  ]);
  assert.deepEqual(r.map((o) => o.id), [3, 2]);
});

test("priceGap: разница в евро и процентах от лучшей цены", () => {
  assert.deepEqual(priceGap(1.2, 1), { eur: 0.2, pct: 20 });
  assert.deepEqual(priceGap(1, 1), { eur: 0, pct: 0 });
});
