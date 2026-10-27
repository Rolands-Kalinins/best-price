import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parse, parseCard, scrape } from "./index";

const list = readFileSync("fixtures/list.html", "utf8");
const card = readFileSync("fixtures/card.html", "utf8");
const TILE = '<li class="product-grid__item">';
const tiles = list.split(TILE).slice(1).map((t) => TILE + t.replace("</ul>", ""));

test("parse: восемь плиток всех видов", () => {
  const { offers, invalid } = parse(list);
  assert.equal(invalid, 0);
  assert.equal(offers.length, 8);
  const by = Object.fromEntries(offers.map((o) => [o.externalId, o]));

  // Старая цена; цена за единицу «gab.» не попадает в kg/l; категория — код; ссылка на карточку.
  const cabbage = by["224570"];
  assert.equal(cabbage.title, "Ziedkāposti gab");
  assert.equal(cabbage.price, 1.59);
  assert.equal(cabbage.oldPrice, 1.99);
  assert.equal(cabbage.unitPrice, null);
  assert.equal(cabbage.condition, null);
  assert.equal(cabbage.category, "SH-2-2-18");
  assert.equal(cabbage.startsAt, null); // период берётся из карточки, не с плитки
  assert.match(cabbage.url, /^https:\/\/www\.rimi\.lv\/e-veikals\/lv\/produkti\/.*\/p\/224570$/);
  assert.match(cabbage.imageUrl ?? "", /^https:\/\/rimibaltic-res\.cloudinary\.com\//);
  assert.equal(by["227060"].unitPrice, 3.86);
  assert.equal(by["227060"].unit, "kg");

  // Цена по карте: цена и цена за кг из этикетки, обычная цена из блока деталей.
  const potato = by["211364"];
  assert.equal(potato.price, 0.19);
  assert.equal(potato.oldPrice, 0.45);
  assert.equal(potato.unitPrice, 0.19);
  assert.equal(potato.unit, "kg");
  assert.equal(potato.condition, "Ar MansRimi karti");
  assert.equal(by["801792"].price, 0.75);
  assert.equal(by["801792"].oldPrice, 0.89);

  // «4 un vairāk −42%»: цена за штуку при покупке от 4, старая цена в самой этикетке.
  const water = by["1362111"];
  assert.equal(water.price, 0.49);
  assert.equal(water.oldPrice, 0.85);
  assert.equal(water.unitPrice, 0.33);
  assert.equal(water.unit, "l");
  assert.equal(water.condition, "4 un vairāk");

  // «Ja liec grozā 2»: цена за две упаковки (7,81 €/кг против 15,59 €/кг за одну), обычная цена удваивается.
  const buns = by["968662"];
  assert.equal(buns.price, 4.99);
  assert.equal(buns.oldPrice, 9.98);
  assert.equal(buns.condition, "Ar MansRimi karti · Cena par 2 gab.");

  // Просто цена (EDLP): ни старой цены, ни условия.
  assert.equal(by["936108"].price, 2.69);
  assert.equal(by["936108"].oldPrice, null);
  assert.equal(by["936108"].condition, null);

  // Сущности в названии раскрыты.
  assert.equal(by["957785"].title, "Salātu maisījums Fit & Easy ,,Gourmet“ 150g");
});

test("parse: битая плитка считается в invalid, остальные целы", () => {
  const broken = `${TILE}<div data-product-code="1"></div></li>`;
  const { offers, invalid } = parse(list + broken);
  assert.equal(offers.length, 8);
  assert.equal(invalid, 1);
});

test("parseCard: период по Риге", () => {
  assert.deepEqual(parseCard(card), {
    startsAt: "2026-10-19T21:00:00.000Z",
    endsAt: "2026-11-02T21:59:59.000Z",
  });
  assert.equal(parseCard("<html>без периода</html>"), null);
});

// Сервер: страница 1 каждого прохода отдаётся функцией pages(номер прохода), дальше пусто; карточка — cardBody.
function mockFetch(pages: (pass: number) => string, cardBody: string | null, failFirst = 0) {
  const real = globalThis.fetch;
  const urls: string[] = [];
  let pass = 0;
  globalThis.fetch = (async (url: string) => {
    urls.push(url);
    // Сетевой сбой, как таймаут из журнала GitHub Actions: первые failFirst запросов.
    if (urls.length <= failFirst) throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    const page = url.match(/currentPage=(\d+)/);
    if (page) return new Response(page[1] === "1" ? pages(++pass) : "<ul></ul>");
    return cardBody === null ? new Response("", { status: 500 }) : new Response(cardBody);
  }) as typeof fetch;
  return { urls, restore: () => (globalThis.fetch = real) };
}
const fast = { delayMs: 0, retryMs: 0 };

test("scrape: проходы объединяются, карточки только для неизвестных", async () => {
  // Порядок нестабилен: в первом проходе нет последних плиток, во втором есть все.
  const m = mockFetch((pass) => `<ul>${(pass === 1 ? tiles.slice(0, 5) : tiles).join("")}</ul>`, card);
  try {
    const period = { startsAt: "2026-10-01T00:00:00.000Z", endsAt: "2026-12-01T00:00:00.000Z" };
    const { offers } = await scrape(new Map([["224570", period]]), { passes: 2, ...fast });
    assert.equal(offers.length, 8);
    assert.ok(m.urls.some((u) => /pageSize=100/.test(u)));
    // Известный товар: период из БД и ни одного запроса за его карточкой; остальные 7 — по разу.
    assert.equal(offers.find((o) => o.externalId === "224570")!.endsAt, period.endsAt);
    assert.equal(m.urls.filter((u) => /\/p\/224570/.test(u)).length, 0);
    assert.equal(m.urls.filter((u) => /\/p\/\d+/.test(u)).length, 7);
    assert.equal(offers.find((o) => o.externalId === "227060")!.endsAt, "2026-11-02T21:59:59.000Z");
  } finally {
    m.restore();
  }
});

test("scrape: сбой карточки не роняет парсер", async () => {
  const m = mockFetch(() => list, null);
  try {
    const { offers } = await scrape(new Map(), { passes: 1, ...fast });
    assert.equal(offers.length, 8);
    assert.ok(offers.every((o) => o.endsAt === null));
  } finally {
    m.restore();
  }
});

test("scrape: пустой список и сломанная разметка — сбой", async () => {
  let m = mockFetch(() => "<ul></ul>", card);
  try {
    await assert.rejects(scrape(new Map(), { passes: 1, ...fast }), /ни одной акции/);
  } finally {
    m.restore();
  }
  const broken = `${TILE}<div data-product-code="1"></div></li>`.repeat(10);
  m = mockFetch(() => broken, card);
  try {
    await assert.rejects(scrape(new Map(), { passes: 1, ...fast }), /не разобрано 10 из 10/);
  } finally {
    m.restore();
  }
});

test("parse: ссылка не путь (@host, //host) — плитка невалидна, парсер не пойдёт на чужой хост", () => {
  const tile = tiles[0];
  const href = tile.match(/class="card__url[^>]*href="([^"]*)"/)![1];
  for (const bad of ["@evil.example/p/1", "//evil.example/p/1", "https://evil.example/p/1"]) {
    const { offers, invalid } = parse(tile.replace(href, bad));
    assert.equal(offers.length, 0, bad);
    assert.equal(invalid, 1, bad);
  }
});

test("scrape: единичный сбой сети или таймаут не роняет запуск, запрос повторяется", async () => {
  const m = mockFetch(() => list, card, 2); // два первых запроса падают, третий проходит
  try {
    const { offers } = await scrape(new Map(), { passes: 1, ...fast });
    assert.equal(offers.length, 8);
    assert.equal(m.urls.filter((u) => /currentPage=1/.test(u)).length, 3); // страница списка: 2 сбоя и успех
  } finally {
    m.restore();
  }
});

test("scrape: постоянный сбой после трёх попыток роняет запуск", async () => {
  const m = mockFetch(() => list, card, 99);
  try {
    await assert.rejects(scrape(new Map(), { passes: 1, ...fast }), /timeout/);
    assert.equal(m.urls.length, 3);
  } finally {
    m.restore();
  }
});

test("scrape: ошибка 4xx не повторяется (повтор не поможет)", async () => {
  const real = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => (calls++, new Response("", { status: 403 }))) as typeof fetch;
  try {
    await assert.rejects(scrape(new Map(), { passes: 1, ...fast }), /HTTP 403/);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = real;
  }
});
