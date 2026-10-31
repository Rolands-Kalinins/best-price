import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { LEAFLET_PROMPT, LEAFLET_SCHEMA, cropRegion, parseBox, isFatalGeminiStatus, modelPool, parseFlyer, parsePages, pickFlyerIdentifiers, toLeafletOffers } from "./leaflet";

const flyer = parseFlyer(JSON.parse(readFileSync("fixtures/leaflet-flyer.json", "utf8")));
const ctx = { flyer, identifier: "aktualais-akciju-buklets-piedavajumi-no-26-10", page: 1 };
const reply = (items: object[]) => JSON.stringify({ items });
// Заготовка ответа модели: поля, которые не нужны тесту, пустые.
const it = (o: object) => ({ kind: "product", card_only: false, second_price: null, brand: null, size: null, price: null, old_price: null, price_card: null, discount_pct: null, condition: null, from: null, to: null, ...o });

test("LEAFLET_SCHEMA: все поля записи обязательны (nullable разрешает null) — иначе модель молча пропускает цены", () => {
  const rec = LEAFLET_SCHEMA.properties.items.items;
  assert.deepEqual([...rec.required].sort(), Object.keys(rec.properties).sort());
  assert.match(LEAFLET_PROMPT, /never translate/i);
});

test("modelPool: основная первая; после сбоя берётся запасная; когда перерыв кончился, основная пробуется снова", () => {
  const pool = modelPool(["main", "backup", "backup2"], 300_000);
  assert.equal(pool.pick(0), "main");
  pool.fail("main", 1000);
  assert.equal(pool.pick(1000), "backup");
  assert.equal(pool.pick(300_999), "backup"); // перерыв основной ещё идёт
  assert.equal(pool.pick(301_000), "main"); // 5 минут прошло: проба основной на следующей странице
  pool.fail("main", 301_000);
  pool.fail("backup", 301_000);
  assert.equal(pool.pick(301_001), "backup2");
});

test("modelPool: все модели в перерыве — null (страница считается сбойной), потом снова доступны; одна модель тоже работает", () => {
  const pool = modelPool(["a", "b"], 1000);
  pool.fail("a", 0);
  pool.fail("b", 0);
  assert.equal(pool.pick(500), null);
  assert.equal(pool.pick(1000), "a");
  const one = modelPool(["a"], 1000);
  one.fail("a", 0);
  assert.equal(one.pick(1), null);
  assert.equal(one.pick(1000), "a");
});

test("parsePages: «1,3-5» → номера; пусто → все; мусор и обратный диапазон — ошибка", () => {
  assert.deepEqual(parsePages("1,3-5"), [1, 3, 4, 5]);
  assert.deepEqual(parsePages(" 2 , 2 "), [2]);
  assert.equal(parsePages(undefined), null);
  assert.throws(() => parsePages("a"), /--pages/);
  assert.throws(() => parsePages("5-3"), /--pages/);
  assert.throws(() => parsePages("0"), /--pages/);
});

test("parseFlyer: id, период и страницы из настоящего ответа API", () => {
  assert.equal(flyer.id, "01a16a1b-4f0f-7ad8-9f06-8236cdcf0726");
  assert.deepEqual([flyer.startsAt, flyer.endsAt], ["2026-10-26", "2026-11-01"]);
  assert.equal(flyer.pages.length, 2);
  assert.equal(flyer.pages[0].number, 1);
  assert.ok(flyer.pages[0].image.startsWith("https://imgproxy.leaflets.schwarz/"));
});

test("parseFlyer: формат изменился — понятная ошибка, а не TypeError", () => {
  assert.throws(() => parseFlyer({ flyer: { id: "x" } }), /формат/);
  assert.throws(() => parseFlyer({}), /формат/);
});

test("pickFlyerIdentifiers: только продуктовые буклеты, по порядку, без повторов", () => {
  const html = `<a href="/l/lv/akciju-buklets/aktualais-akciju-buklets-piedavajumi-no-26-10/view/overview/page/40">
    <a href="/l/lv/akciju-buklets/nepartikas-precu-piedavajums-piedavajumi-no-26-10/view/overview/page/2">
    <a href="/l/lv/akciju-buklets/aktualais-akciju-buklets-piedavajumi-no-02-11/ar/0">
    <a href="/l/lv/akciju-buklets/aktualais-akciju-buklets-piedavajumi-no-26-10/ar/0">`;
  assert.deepEqual(pickFlyerIdentifiers(html), ["aktualais-akciju-buklets-piedavajumi-no-26-10", "aktualais-akciju-buklets-piedavajumi-no-02-11"]);
});

test("toLeafletOffers: страница 1 — товар, цена по карте, скидка на категорию", () => {
  const { offers, invalid } = toLeafletOffers(
    reply([
      it({ name: "Pilos Piens UHT, 3,2%", size: "1 L", price: 0.39, old_price: 0.79, discount_pct: 51, condition: "Ar Lidl Plus, minimālais grozs 40 €" }),
      it({ name: "Mila's World Sausā barība kaķiem", size: "800 g", price: 3.69, old_price: 4.99, discount_pct: 26 }),
      it({ kind: "category", name: "Bellarom maltas kafijas izlase", brand: "Bellarom", discount_pct: 30, condition: "Ar Lidl Plus kuponu", to: "28.10" }),
    ]),
    ctx,
  );
  assert.deepEqual(invalid, []);
  assert.equal(offers.length, 3);
  const [milk, mila, coffee] = offers;
  assert.equal(milk.price, 0.39);
  assert.equal(milk.oldPrice, 0.79);
  assert.equal(milk.discountPercent, 51);
  assert.equal(milk.unitPrice, 0.39); // 1 L → цена за литр считается кодом, а не моделью
  assert.equal(milk.unit, "l");
  assert.equal(mila.unitPrice, 4.61); // 800 g за 3,69
  assert.equal(coffee.price, null); // скидка на категорию: цены нет
  assert.equal(coffee.discountPercent, 30);
  assert.equal(coffee.brand, "Bellarom");
  assert.equal(milk.url, "https://www.lidl.lv/l/lv/akciju-buklets/aktualais-akciju-buklets-piedavajumi-no-26-10/view/flyer/page/1");
});

test("toLeafletOffers: две цены на плитке — price для всех, price_card по Lidl Plus", () => {
  const { offers } = toLeafletOffers(
    reply([it({ name: "Kartupeļi", size: "1 kg", price: 0.29, old_price: 0.49, price_card: 0.19, discount_pct: 61, condition: "Ar Lidl Plus" })]),
    { ...ctx, page: 40 },
  );
  assert.equal(offers[0].price, 0.29);
  assert.equal(offers[0].priceCard, 0.19);
  assert.equal(offers[0].oldPrice, 0.49);
});

test("toLeafletOffers: даты — по умолчанию период буклета, с плитки «с 31.10 до 01.11» по-рижски", () => {
  const { offers } = toLeafletOffers(
    reply([
      it({ name: "A", price: 1 }),
      it({ name: "B", price: 1, from: "31.10", to: "01.11" }),
      it({ name: "C", price: 1, from: "29.10" }),
    ]),
    ctx,
  );
  const [a, b, c] = offers;
  // 26.10 — зима уже началась (переход 25.10.2026): UTC+2. 01.11 включительно до конца дня.
  assert.deepEqual([a.startsAt, a.endsAt], ["2026-10-25T22:00:00.000Z", "2026-11-01T21:59:59.000Z"]);
  assert.deepEqual([b.startsAt, b.endsAt], ["2026-10-30T22:00:00.000Z", "2026-11-01T21:59:59.000Z"]);
  assert.deepEqual([c.startsAt, c.endsAt], ["2026-10-28T22:00:00.000Z", "2026-11-01T21:59:59.000Z"]);
});

test("toLeafletOffers: дата вне периода буклета или мусор — берётся период буклета", () => {
  const { offers } = toLeafletOffers(reply([it({ name: "A", price: 1, from: "01.01", to: "31.12" }), it({ name: "B", price: 1, from: "вчера", to: "99.99" })]), ctx);
  for (const o of offers) assert.deepEqual([o.startsAt, o.endsAt], ["2026-10-25T22:00:00.000Z", "2026-11-01T21:59:59.000Z"]);
});

test("toLeafletOffers: галлюцинации отбрасываются и перечисляются: цена 0, нет цены у товара, скидка не сходится", () => {
  const { offers, invalid } = toLeafletOffers(
    reply([
      it({ name: "Bellarom", price: 0, discount_pct: 30 }),
      it({ name: "Без цены" }),
      it({ name: "Скидка врёт", price: 1, old_price: 2, discount_pct: 10 }),
      it({ kind: "category", name: "Категория без процента" }),
      it({ name: "Нормальный", price: 1.5 }),
    ]),
    ctx,
  );
  assert.deepEqual(offers.map((o) => o.title), ["Нормальный"]);
  assert.equal(invalid.length, 4);
  assert.ok(invalid.every((s) => typeof s === "string" && s.length > 0));
});

test("toLeafletOffers: нелепая цена (≥ 10 000 €) отбрасывается: она уронила бы numeric(10,2) и всю страницу", () => {
  const { offers, invalid } = toLeafletOffers(reply([it({ name: "A", price: 99999999999 }), it({ name: "B", price: 1, old_price: 123456789 }), it({ name: "C", price: 9999.99 })]), ctx);
  assert.deepEqual(offers.map((o) => o.title), ["C"]);
  assert.equal(invalid.length, 2);
});

test("isFatalGeminiStatus: стоп на квоте и ключе (429, 401, 403); сеть, 400 по одной картинке и 5xx — страница пропускается", () => {
  for (const s of [429, 401, 403]) assert.equal(isFatalGeminiStatus(s), true);
  for (const s of [0, 400, 500, 503]) assert.equal(isFatalGeminiStatus(s), false);
});

test("toLeafletOffers: price_card не ниже price — игнорируется; старая цена не выше новой — убирается (offerSchema)", () => {
  const { offers } = toLeafletOffers(reply([it({ name: "A", price: 1, price_card: 1.5 }), it({ name: "B", price: 2, old_price: 1 })]), ctx);
  assert.equal(offers[0].priceCard, null);
  assert.equal(offers[1].oldPrice, null);
});

test("toLeafletOffers: одинаковая плитка дважды — одна запись; id стабилен между запусками, различается по странице и цене", () => {
  const a = toLeafletOffers(reply([it({ name: "Coca-Cola", size: "1 l", price: 1.32 }), it({ name: "Coca-Cola", size: "1 l", price: 1.32 }), it({ name: "Coca-Cola", size: "1 l", price: 0.46 })]), ctx).offers;
  assert.equal(a.length, 2);
  const again = toLeafletOffers(reply([it({ name: "Coca-Cola", size: "1 l", price: 1.32 })]), ctx).offers;
  assert.equal(again[0].externalId, a[0].externalId);
  const otherPage = toLeafletOffers(reply([it({ name: "Coca-Cola", size: "1 l", price: 1.32 })]), { ...ctx, page: 2 }).offers;
  assert.notEqual(otherPage[0].externalId, a[0].externalId);
});

test("toLeafletOffers: название чистится (пробелы, управляющие символы); HTML остаётся текстом", () => {
  const { offers } = toLeafletOffers(reply([it({ name: "  Piens\n  <b>3,2%</b>\u0000 ", price: 1 })]), ctx);
  assert.equal(offers[0].title, "Piens <b>3,2%</b>"); // экранирует вывод React, в базе это просто текст
});

test("toLeafletOffers: ответ модели не JSON или без items — ошибка (страница не считается обработанной)", () => {
  assert.throws(() => toLeafletOffers("не json", ctx));
  assert.throws(() => toLeafletOffers(JSON.stringify({ foo: 1 }), ctx), /items/);
});

test("toLeafletOffers: акция «2+1» без цены и процента сохраняется по условию; без условия отбрасывается", () => {
  const { offers, invalid } = toLeafletOffers(reply([it({ kind: "category", name: "FIN CARRE šokolādes tāfelīšu izlasei", condition: "2+1 Ar Lidl Plus" }), it({ kind: "category", name: "Пустая" })]), ctx);
  assert.deepEqual(offers.map((o) => [o.title, o.price, o.discountPercent, o.condition]), [["FIN CARRE šokolādes tāfelīšu izlasei", null, null, "2+1 Ar Lidl Plus"]]);
  assert.equal(invalid.length, 1);
});

test("toLeafletOffers: card_only (плашка Ar Lidl Plus у большой цены) — большая цена по карте, зачёркнутая становится обычной", () => {
  const { offers } = toLeafletOffers(
    reply([
      it({ name: "PILOS Ayran", price: 0.45, old_price: 0.59, discount_pct: 24, card_only: true }),
      it({ name: "Без зачёркнутой", price: 1.5, card_only: true }),
      it({ name: "Обычная скидка", price: 1.89, old_price: 2.49, discount_pct: 24 }),
    ]),
    ctx,
  );
  assert.deepEqual(offers.map((o) => [o.price, o.priceCard, o.oldPrice, o.condition]), [[0.59, 0.45, null, null], [1.5, null, null, "Lidl Plus"], [1.89, null, 2.49, null]]);
});

test("LEAFLET_PROMPT: цена с плашкой Ar Lidl Plus — это цена по карте, обычная цена — зачёркнутая (PILOS Ayran 0,45 при 0,59)", () => {
  assert.match(LEAFLET_PROMPT, /card_only = true/);
  const { offers } = toLeafletOffers(reply([it({ name: "PILOS Ayran", price: 0.59, price_card: 0.45, discount_pct: 24 })]), ctx);
  assert.deepEqual([offers[0].price, offers[0].priceCard, offers[0].oldPrice], [0.59, 0.45, null]);
});

test("parseBox: рамка фото принимается только целая, в пределах 0–1000 и не вырожденная; нули — фото нет", () => {
  assert.deepEqual(parseBox([210, 23, 323, 533]), [210, 23, 323, 533]);
  for (const bad of [[0, 0, 0, 0], [10, 10, 5, 50], [0, 0, 1001, 50], [1.5, 0, 100, 100], [1, 2, 3], null, undefined]) assert.equal(parseBox(bad as number[]), null);
  const { offers } = toLeafletOffers(reply([it({ name: "A", price: 1, photo_box: [210, 23, 323, 533] }), it({ name: "B", price: 1, photo_box: [0, 0, 0, 0] }), it({ name: "C", price: 1 })]), ctx);
  assert.deepEqual(offers.map((o) => o.photoBox), [[210, 23, 323, 533], null, null]);
});

test("cropRegion: рамка 0–1000 → пиксели страницы", () => {
  assert.deepEqual(cropRegion([500, 100, 600, 300], 1000, 2000), { left: 100, top: 1000, width: 200, height: 200 });
  assert.deepEqual(cropRegion([900, 900, 1000, 1000], 1441, 2400), { left: 1297, top: 2160, width: 144, height: 240 });
});

test("toLeafletOffers: «2. prece» — цена одного товара остаётся ценой, цена второго отдельно, скидки и «по карте» нет (Coca-Cola 1,32 / вторая 0,46)", () => {
  const { offers } = toLeafletOffers(reply([it({ name: "Coca-Cola", size: "1 l", price: 1.32, second_price: 0.46, price_card: 0.46, discount_pct: 65, card_only: true, condition: "2. precei ar Lidl Plus" })]), ctx);
  assert.deepEqual([offers[0].price, offers[0].priceSecond, offers[0].priceCard, offers[0].oldPrice, offers[0].discountPercent, offers[0].condition], [1.32, 0.46, null, null, null, "2. precei ar Lidl Plus"]);
  // вторая не дешевле первой — ошибка чтения, поле отбрасывается
  assert.equal(toLeafletOffers(reply([it({ name: "A", price: 1, second_price: 2 })]), ctx).offers[0].priceSecond, null);
});
