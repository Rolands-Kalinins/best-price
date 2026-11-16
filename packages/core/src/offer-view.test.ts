import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { activeFilter, discountPercent, endsSoon, hasCyrillic, isOfferLanding, isStale, offerDiscount, parseQuery, priceGap, SEARCH_FROM, SEARCH_TO, safeHttpUrl, searchTerms, storePrices, MAX_SEARCH_WORDS, MAX_SEARCH_CHARS } from "./offer-view";

test("safeHttpUrl: наша миниатюра /grocery/img/<магазин>/<ключ> разрешена, любой другой относительный путь нет", () => {
  assert.equal(safeHttpUrl("/grocery/img/1/ab12cd"), "/grocery/img/1/ab12cd");
  for (const bad of ["/grocery/img/1/../x", "//evil.test/a", "/other", "/grocery/img/x/ab", "/grocery/img/1/AB?x=1"]) assert.equal(safeHttpUrl(bad), null);
});

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
  const def = { q: "", store: null, cat: null, cond: false, scope: false, sort: "discount", n: 60, all: false };
  assert.deepEqual(parseQuery(new URLSearchParams("")), def);
  assert.deepEqual(parseQuery(new URLSearchParams("sort=хаос&store=abc&cond=yes&scope=да&cat=nope&all=yes")), def);
  assert.deepEqual(parseQuery(new URLSearchParams("store=0")), def);
  assert.deepEqual(parseQuery(new URLSearchParams("store=-3")), def);
  assert.deepEqual(parseQuery(new URLSearchParams("q=pienas&store=2&cat=dairy&cond=1&scope=1&sort=price&all=1")), {
    q: "pienas",
    store: 2,
    cat: "dairy",
    cond: true,
    scope: true,
    sort: "price",
    n: 60,
    all: true,
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

test("searchTerms: «^» из ввода убирается, пользователь не включит поиск с начала слова", () => {
  assert.deepEqual(searchTerms("^sula a,b"), ["sula", "a,b"]);
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

test("endsSoon: сегодня и завтра считаются по календарным дням Риги, а не по 24 часам", () => {
  const now = new Date("2026-11-01T10:00:00Z"); // 12:00 в Риге
  assert.equal(endsSoon("2026-11-01T21:30:00Z", now), "today"); // 23:30 по Риге того же дня
  assert.equal(endsSoon("2026-11-01T22:30:00Z", now), "tomorrow"); // 00:30 2 ноября по Риге, хотя UTC ещё 1-е
  assert.equal(endsSoon("2026-11-02T21:00:00Z", now), "tomorrow");
  assert.equal(endsSoon("2026-11-02T22:30:00Z", now), null); // послезавтра
  assert.equal(endsSoon("2026-10-31T10:00:00Z", now), null); // уже кончилась
  assert.equal(endsSoon(null, now), null);
});

test("isStale: данные старше 48 часов устарели", () => {
  const now = new Date("2026-11-03T12:00:00Z");
  assert.equal(isStale("2026-11-01T12:01:00Z", now), false);
  assert.equal(isStale("2026-11-01T11:59:00Z", now), true);
  assert.equal(isStale("2026-10-29T12:01:00Z", now, 192), false); // порог магазина с запуском раз в неделю
  assert.equal(isStale("2026-10-26T11:59:00Z", now, 192), true);
});

test("searchTerms: длинный ввод обрезается (иначе адрес запроса к БД не влезает в лимит и страница падает)", () => {
  assert.ok(searchTerms("а ".repeat(5000)).length <= MAX_SEARCH_WORDS);
  assert.ok(searchTerms("x".repeat(5000)).join("").length <= MAX_SEARCH_CHARS);
  assert.deepEqual(searchTerms("молоко valio"), ["молоко", "valio"]); // обычный ввод не затронут
});

test("isOfferLanding: чистая страница акций — без поиска, категории, магазина и переключателей; сортировка, страница и «all» не в счёт", () => {
  const q = (s: string) => parseQuery(new URLSearchParams(s));
  assert.equal(isOfferLanding(q("")), true);
  assert.equal(isOfferLanding(q("sort=price&n=120&all=1")), true);
  for (const s of ["q=piens", "store=2", "cat=dairy", "cond=1", "scope=1"]) assert.equal(isOfferLanding(q(s)), false, s);
});

test("searchTerms: слова из ввода не содержат масок like и «^» (запятые и скобки безопасны: слово идёт одним параметром like, не в or())", () => {
  for (const q of ["a,b", "x),(y", "a.b.c", `"q"`, "a%b", "x'y;--", "(a)", "^sula", "50% a_b c\d *"]) {
    for (const t of searchTerms(q)) assert.doesNotMatch(t, /[%_\*^]/, `${q}: ${t}`);
  }
});

test("searchTerms: русское слово не переводится, ищется как есть (русского поиска нет)", () => {
  assert.deepEqual(searchTerms("Молоко Valio"), ["молоко", "valio"]);
});

test("hasCyrillic: русский ввод распознаётся (для подсказки «поиск латышский»), латышский и цифры нет", () => {
  assert.equal(hasCyrillic("молоко"), true);
  assert.equal(hasCyrillic("piens молоко"), true);
  assert.equal(hasCyrillic("Ёж"), true);
  assert.equal(hasCyrillic("piens"), false);
  assert.equal(hasCyrillic("šokolāde 2,5%"), false);
  assert.equal(hasCyrillic(""), false);
});
