import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parse, scrape } from "./index";

type Item = Record<string, any>;
// Записи поиска Luigi's Box, снятые 2026-11-01 (без описаний): акция, обычный, рецептурный (в каталоге у него статус new), PZN вместо штрихкода, цена по карте.
const fixture = JSON.parse(readFileSync("fixtures/hits.json", "utf8")) as { results: { hits: Item[] } };
const [sale, plain, rx, pzn, card] = fixture.results.hits;
const clone = <T>(x: T): T => structuredClone(x);
const NOW = new Date("2026-11-01T12:00:00Z");

test("parse: акция — цена, старая цена, срок по Риге с годом, ссылка, картинка, путь категории, штрихкод", () => {
  const { products, invalid } = parse([sale], NOW);
  assert.equal(invalid, 0);
  const p = products[0];
  assert.equal(p.externalId, "10000568");
  assert.equal(p.title, "BIODERMA Atoderm Crème Ultra krēms 500 ml");
  assert.equal(p.brand, "BIODERMA");
  assert.equal(p.price, 12.6);
  assert.equal(p.oldPrice, 27.99);
  // «01.11. - 30.11.»: начало 1 ноября 00:00 и конец 30 ноября 23:59:59 по Риге зимой (UTC+2).
  assert.equal(p.startsAt, "2026-10-31T22:00:00.000Z");
  assert.equal(p.endsAt, "2026-11-30T21:59:59.000Z");
  assert.equal(p.url, "https://www.benu.lv/p/bioderma-atoderm-creme-ultra-krems-500-ml");
  assert.match(p.imageUrl!, /^https:\/\/www\.benu\.lv\/media\//);
  // Слаги без диакритики, как у Mēness: по ним categorize ищет основы.
  assert.equal(p.category, "skaistums-un-adas-kopsana/kermena-kopsana/kremi-un-losjoni");
  assert.equal(p.ean, "3701129805312");
  assert.equal(p.prescription, false);
  assert.equal(p.inStock, true);
});

test("parse: без акции — старой цены и срока нет", () => {
  const p = parse([plain], NOW).products[0];
  assert.equal(p.price, 7.19);
  assert.equal(p.oldPrice, null);
  assert.equal(p.startsAt, null);
  assert.equal(p.endsAt, null);
});

test("parse: срок через границу года — «15.12. - 10.01.» заканчивается в следующем году, «05.06. - 31.12.» начался в этом", () => {
  const a = clone(sale);
  a.attributes.classic_discount_date = ["15.12. - 10.01."];
  const p = parse([a], new Date("2026-12-20T12:00:00Z")).products[0];
  assert.equal(p.startsAt, "2026-12-14T22:00:00.000Z");
  assert.equal(p.endsAt, "2027-01-10T21:59:59.000Z");
  const b = clone(sale);
  b.attributes.classic_discount_date = ["05.06. - 31.12."];
  const q = parse([b], NOW).products[0];
  assert.equal(q.startsAt, "2026-06-04T21:00:00.000Z");
  assert.equal(q.endsAt, "2026-12-31T21:59:59.000Z");
});

test("parse: скидка без срока или со срокам в неожиданном формате — цена остаётся, срок пустой", () => {
  const a = clone(sale);
  delete a.attributes.classic_discount_date;
  const p = parse([a], NOW).products[0];
  assert.equal(p.oldPrice, 27.99);
  assert.deepEqual([p.startsAt, p.endsAt], [null, null]);
  a.attributes.classic_discount_date = ["до конца месяца"];
  assert.equal(parse([a], NOW).invalid, 0);
});

test("parse: не штрихкод (PZN-…) в ean не попадает", () => {
  assert.equal(parse([pzn], NOW).products[0].ean, null);
});

test("parse: рецептурный помечается, а не отбрасывается (у такого в каталоге статус new, в выборку active он сейчас не попадает)", () => {
  const r = clone(rx);
  Object.assign(r.attributes, { status: ["active"], availability: "1" });
  const p = parse([r], NOW).products[0];
  assert.equal(p.prescription, true);
  assert.equal(p.category, null);
});

test("parse: цена по карте Benu с периодом; у товара без неё поля пустые", () => {
  const c = clone(card);
  Object.assign(c.attributes, { status: ["active"], availability: "1", benu_card_discount_date: ["16.01. - 31.01."] });
  const p = parse([c], NOW).products[0];
  assert.equal(p.price, 41.69);
  assert.equal(p.cardPrice, 25.01);
  assert.equal(p.cardCondition, "Ar Benu karti");
  assert.equal(p.cardStartsAt, "2027-01-15T22:00:00.000Z");
  assert.equal(p.cardEndsAt, "2027-01-31T21:59:59.000Z");
  const none = parse([plain], NOW).products[0];
  assert.deepEqual([none.cardPrice, none.cardCondition, none.cardStartsAt, none.cardEndsAt], [null, null, null, null]);
});

test("parse: не active пропущен (не invalid), нет в наличии — inStock false, битый — invalid", () => {
  const hidden = clone(plain);
  hidden.attributes.status = ["hidden"];
  const out = clone(plain);
  out.attributes.item_id = 2;
  out.attributes.availability = "0";
  const bad = clone(plain);
  bad.attributes.item_id = 3;
  bad.attributes.price_amount = 0;
  const r = parse([hidden, out, bad], NOW);
  assert.equal(r.products.length, 1);
  assert.equal(r.products[0].inStock, false);
  assert.equal(r.invalid, 1);
});

test("parse: нет item_id — берём to_cart_id", () => {
  const a = clone(plain);
  delete a.attributes.item_id;
  a.attributes.to_cart_id = [555];
  assert.equal(parse([a], NOW).products[0].externalId, "555");
});

// Подмена fetch: pages — тела ответов по порядку, число — HTTP-статус.
function mockFetch(pages: (object | number)[]) {
  const real = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (url: string) => {
    calls.push(url);
    const r = pages.shift();
    if (typeof r === "number") return new Response("err", { status: r });
    return Response.json(r);
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = real) };
}
const withId = (id: number) => {
  const h = clone(plain);
  h.attributes.item_id = id;
  h.url = `/p/x-${id}`;
  return h;
};
const page = (hits: Item[], total: number) => ({ results: { total_hits: total, hits } });
const opts = { retryMs: 0, pauseMs: 0, minProducts: 1, perPage: 2, now: NOW };

test("scrape: идёт по страницам до total_hits, просит стабильную сортировку и повторяет 429/500", async () => {
  const m = mockFetch([page([withId(1), withId(2)], 3), 429, 500, page([withId(3)], 3)]);
  try {
    const { products } = await scrape(opts);
    assert.deepEqual(products.map((p) => p.externalId), ["1", "2", "3"]);
    assert.ok(m.calls[0].includes("status:active") && m.calls[0].includes("availability:1") && m.calls[0].includes("sort=item_id:asc"));
    assert.ok(m.calls[0].includes("size=2&page=1") && m.calls[3].includes("page=2"));
    assert.equal(m.calls.length, 4);
  } finally {
    m.restore();
  }
});

test("scrape: сервер отдал меньше записей, чем total_hits — ошибка, а не тихая потеря", async () => {
  const m = mockFetch([page([withId(1), withId(2)], 10), page([], 10)]);
  try {
    await assert.rejects(scrape(opts), /2 из 10/);
  } finally {
    m.restore();
  }
});

test("scrape: total_hits упёрся в окно 10 000 — ошибка (выборку надо делить)", async () => {
  const m = mockFetch([page([withId(1), withId(2)], 10_000)]);
  try {
    await assert.rejects(scrape(opts), /10 000/);
  } finally {
    m.restore();
  }
});

test("scrape: неожиданный формат ответа — ошибка", async () => {
  const m = mockFetch([{ results: {} }]);
  try {
    await assert.rejects(scrape(opts), /формат/);
  } finally {
    m.restore();
  }
});

test("scrape: товаров меньше ожидаемого минимума — ошибка", async () => {
  const m = mockFetch([page([withId(1)], 1)]);
  try {
    await assert.rejects(scrape({ ...opts, minProducts: 5 }), /от 5/);
  } finally {
    m.restore();
  }
});
