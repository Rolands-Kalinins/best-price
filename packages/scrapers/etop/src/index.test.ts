import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parse, scrape } from "./index";

const fixture = JSON.parse(readFileSync("fixtures/promotion-products.json", "utf8")) as {
  list: Array<Record<string, unknown> & { id: string }>;
};

test("parse: товары всех типов скидки", () => {
  const { offers, invalid } = parse(fixture.list);
  assert.equal(invalid, 0);
  assert.equal(offers.length, 10);
  const by = Object.fromEntries(offers.map((o) => [o.title, o]));

  // Тип 3: цена акции как есть, обычная цена до акции (нижняя граница), цена за кг из названия, даты по Риге.
  const jokers = by["GRAUZDIŅI JOKERS AR ĶIPLOKU GARŠU 60G"];
  assert.equal(jokers.price, 0.47);
  assert.equal(jokers.oldPrice, 0.97);
  assert.equal(jokers.brand, "JOKERS");
  assert.equal(jokers.category, "Maizes izstrādājumi");
  assert.equal(jokers.ean, "4820242441968");
  assert.equal(jokers.unitPrice, 7.83);
  assert.equal(jokers.unit, "kg");
  assert.equal(jokers.condition, null);
  assert.equal(jokers.startsAt, "2026-10-20T21:00:00.000Z");
  // Сайт пишет «līdz 19.11»: конец дня по Риге, а не полночь следующего.
  assert.equal(jokers.endsAt, "2026-11-18T21:59:59.000Z");
  assert.equal(jokers.url, "https://etop.lv/lv/visi-akcijas-produkti");
  assert.ok(jokers.imageUrl?.startsWith("https://"));

  // Обычной цены нет (0): oldPrice пуст.
  assert.equal(by["BEKONS NĀKOTNE KARSTI KŪPINĀTS 300G"].oldPrice, null);

  // Весовой товар без веса в названии: цены за кг нет, товар цел.
  assert.equal(by["SIERS TILSIT 45% SVERAMS"].price, 5.99);
  assert.equal(by["SIERS TILSIT 45% SVERAMS"].unitPrice, null);

  // Тип 9: цена по карте top! ниже обычной → цена по карте, обычная как старая, условие.
  const cat = by["BARĪBA KAĶIEM SAUSĀ ONE INDOOR FORMULA TĪTARS 750G"];
  assert.equal(cat.price, 4.29);
  assert.equal(cat.oldPrice, 6.49);
  assert.equal(cat.condition, "Ar top! karti");
  assert.equal(cat.unitPrice, 5.72);

  // Тип 18 (ZG): без карты и без обычной цены.
  const tere = by["KAUSĒTAIS SIERS TERE KLASISKAIS 200G"];
  assert.equal(tere.price, 1.09);
  assert.equal(tere.oldPrice, null);
  assert.equal(tere.condition, null);

  // Тип 21 (TIP TOP): цена по карте равна обычной, это просто цена, условия нет.
  const surimi = by["SURIMI NŪJIŅAS TIP TOP ATDZESĒTAS 200G"];
  assert.equal(surimi.price, 1.59);
  assert.equal(surimi.oldPrice, null);
  assert.equal(surimi.condition, null);
});

test("parse: битая запись отбрасывается и считается", () => {
  const { offers, invalid } = parse([{ ...fixture.list[0], discountedPrice: 0 }, { id: "x" }, fixture.list[1]]);
  assert.equal(offers.length, 1);
  assert.equal(invalid, 2);
});

// Страницы как у сайта: totalCount на первой странице занижен (1000), hasMore верен.
function pages(list: unknown[], size: number, total = list.length) {
  const calls: unknown[] = [];
  const fn = async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { page: number; pageSize: number };
    calls.push(body);
    const slice = list.slice((body.page - 1) * body.pageSize, body.page * body.pageSize);
    return Response.json({ list: slice, totalCount: total, hasMore: body.page * body.pageSize < list.length });
  };
  return { fn: fn as typeof fetch, calls };
}

test("scrape: идёт по страницам, пока hasMore", async () => {
  const { fn, calls } = pages(fixture.list, 4);
  const { offers } = await scrape(fn, 4);
  assert.equal(offers.length, 10);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[0], { discountTypes: [], page: 1, pageSize: 4 });
});

test("scrape: получено меньше, чем totalCount, значит сбой", async () => {
  const { fn } = pages(fixture.list, 4, 14);
  await assert.rejects(scrape(fn, 4), /10 из 14/);
});

test("scrape: HTTP-ошибка и неожиданный формат", async () => {
  await assert.rejects(scrape((async () => new Response("", { status: 500 })) as typeof fetch), /HTTP 500/);
  await assert.rejects(scrape((async () => Response.json({ foo: 1 })) as typeof fetch), /формат/);
});
