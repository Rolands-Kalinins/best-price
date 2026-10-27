import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parse, scrape } from "./index";

const fixture = JSON.parse(readFileSync("fixtures/salesloadmore.json", "utf8")) as {
  html: string;
  totalItems: string; // как на живом сайте: "878", а не 878
};

test("parse: двенадцать плиток всех видов", () => {
  const { offers, invalid } = parse(fixture.html);
  assert.equal(invalid, 0);
  assert.equal(offers.length, 12);
  const by = Object.fromEntries(offers.map((o) => [o.externalId, o]));

  // Цена со старой ценой, без карты; цена за кг из названия; даты по Риге (до 25.10 лето, после зима).
  const potato = by["257613"];
  assert.equal(potato.title, "Sarkanie kartupeļi, 2,5 kg");
  assert.equal(potato.price, 1.19);
  assert.equal(potato.oldPrice, 1.69);
  assert.equal(potato.discountPercent, null);
  assert.equal(potato.condition, null);
  assert.equal(potato.unitPrice, 0.48);
  assert.equal(potato.unit, "kg");
  assert.equal(potato.startsAt, "2026-10-19T21:00:00.000Z");
  assert.equal(potato.endsAt, "2026-10-26T21:59:59.000Z");
  assert.equal(potato.url, "https://www.maxima.lv/piedavajumi");
  assert.ok(potato.imageUrl?.startsWith("https://www.maxima.lv/uploads/sale/"));

  // Без цены за единицу в названии: товар цел, единицы нет.
  assert.equal(by["257634"].price, 5.99);
  assert.equal(by["257634"].oldPrice, 8.99);
  assert.equal(by["257634"].unitPrice, null);

  // Цена по карте PALDIES: цена по карте, обычная цена как старая, условие; берём первую цену за единицу (по карте).
  const cola = by["257640"];
  assert.equal(cola.price, 1.29);
  assert.equal(cola.oldPrice, 2.65);
  assert.equal(cola.condition, "Ar PALDIES karti");
  assert.equal(cola.unitPrice, 0.86);
  assert.equal(cola.unit, "l");
  // «no 9,66 €/kg»: цена за единицу «от».
  assert.equal(by["257677"].unitPrice, 9.66);
  assert.equal(by["257677"].condition, "Ar PALDIES karti");

  // Старая цена с пометкой «no» («от 1,99»): блок «no» не должен обрывать разбор.
  assert.equal(by["257669"].price, 1.49);
  assert.equal(by["257669"].oldPrice, 1.99);

  // «2x 130 g»: цена относится к паре, а не к одной упаковке (7,69 €/kg = 2,00 / 0,26 кг).
  assert.equal(by["257638"].price, 2);
  assert.equal(by["257638"].oldPrice, 4.98);
  assert.equal(by["257638"].condition, "Cena par 2 gab.");
  assert.equal(by["257638"].unitPrice, 7.69);
  // «1 + 1»: то же самое, плюс слова магазина.
  assert.equal(by["257786"].price, 1.99);
  assert.equal(by["257786"].condition, "Cena par 2 gab. (1 + 1)");

  // Просто цена (EDLP): ни старой цены, ни условия.
  assert.equal(by["257711"].price, 2.04);
  assert.equal(by["257711"].oldPrice, null);
  assert.equal(by["257711"].condition, null);

  // Скидка на бренд: цены нет, бренд из заглавных слов в конце названия.
  const milka = by["257633"];
  assert.equal(milka.title, "Saldumiem MILKA");
  assert.equal(milka.price, null);
  assert.equal(milka.discountPercent, 30);
  assert.equal(milka.brand, "MILKA");
  assert.equal(milka.condition, null);
  // Оговорка в скобках не мешает найти бренд.
  assert.equal(by["257673"].brand, "LAIMA");
  assert.equal(by["257673"].discountPercent, 25);
  // Скидка на категорию: бренда нет.
  assert.equal(by["257512"].title, "Majonēzēm");
  assert.equal(by["257512"].brand, null);
  // Условие скидки.
  assert.equal(by["257507"].discountPercent, 40);
  assert.equal(by["257507"].condition, "Pērkot jebkuras 2 preces");
});

test("parse: битая плитка считается в invalid, остальные целы", () => {
  const broken = '<div class="col-third offer-item"><div class="item" data-product-id="1" data-dates-interval="20.10. - 26.10.2026."></div></div>';
  const { offers, invalid } = parse(fixture.html + broken);
  assert.equal(offers.length, 12);
  assert.equal(invalid, 1);
});

test("scrape: один запрос с limit, проверка totalItems", async () => {
  const real = globalThis.fetch;
  const urls: string[] = [];
  let body: object = fixture;
  globalThis.fetch = (async (url: string) => {
    urls.push(url);
    return Response.json(body);
  }) as typeof fetch;
  try {
    const { offers } = await scrape();
    assert.equal(offers.length, 12);
    assert.equal(urls.length, 1);
    assert.match(urls[0], /limit=5000/);
    // Сервер отдал меньше, чем обещал (лимит урезан): сбой, а не тихая потеря товаров.
    body = { ...fixture, totalItems: "878" };
    await assert.rejects(scrape(), /878/);
    // Разметка поменялась: большая часть плиток не разобралась, это сбой, а не «успех» с огрызком данных.
    const broken = '<div class="col-third offer-item"><div data-product-id="1"></div></div>';
    body = { html: fixture.html + broken.repeat(3), totalItems: "15" };
    await assert.rejects(scrape(), /не разобрано 3 из 15/);
    // Формат ответа изменился.
    body = { html: 5 };
    await assert.rejects(scrape(), /формат/);
  } finally {
    globalThis.fetch = real;
  }
});

test("scrape: акций больше прежнего потолка в 1000 (1136 на 2026-10-27) приходят все", async () => {
  // Сервер как настоящий: отдаёт не больше limit плиток, totalItems — сколько их всего.
  const tile = fixture.html.split('<div class="col-third offer-item').slice(1)[0];
  const total = 1136;
  const all = Array.from({ length: total }, (_, i) =>
    '<div class="col-third offer-item' + tile.replace(/data-product-id="\d+"/, `data-product-id="${900000 + i}"`),
  );
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    const limit = Number(new URL(url).searchParams.get("limit"));
    return Response.json({ html: all.slice(0, limit).join(""), totalItems: String(total) });
  }) as typeof fetch;
  try {
    const { offers } = await scrape();
    assert.equal(offers.length, total);
  } finally {
    globalThis.fetch = real;
  }
});
