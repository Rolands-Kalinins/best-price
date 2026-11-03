import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { conditionKind } from "@bestprice/core";
import { parse, scrape } from "./index";

const load = (name: string) => JSON.parse(readFileSync(`fixtures/${name}.json`, "utf8")) as { count: number; inventories: { id: string }[]; categoryTree: unknown };
const akcijas = load("akcijas");
const paldies = load("paldies");

test("parse: все виды акций Barbora на реальных позициях", () => {
  const { offers, invalid } = parse([...akcijas.inventories, ...paldies.inventories], [akcijas.categoryTree, paldies.categoryTree]);
  // 11 позиций: 2 пропущены (нет в наличии, нет акции), остальные 9 целы.
  assert.equal(invalid, 0);
  assert.equal(offers.length, 9);
  const by = Object.fromEntries(offers.map((o) => [o.title, o]));

  // Обычная скидка: цена и старая цена как есть, цена за кг с сайта, срок до конца дня по Риге (зима UTC+2), начала у Barbora нет.
  const cheese = by["Krēmsiers WELL DONE 57,5% 200g"];
  assert.equal(cheese.externalId, "000000000001343205");
  assert.equal(cheese.price, 1.39);
  assert.equal(cheese.oldPrice, 1.59);
  assert.equal(cheese.unitPrice, 6.95);
  assert.equal(cheese.unit, "kg");
  assert.equal(cheese.condition, null);
  assert.equal(cheese.brand, "WELL DONE");
  assert.equal(cheese.startsAt, null);
  assert.equal(cheese.endsAt, "2026-11-02T21:59:59.000Z");
  assert.equal(cheese.url, "https://barbora.lv/p/kremsiers-well-done-57-5-proc-200-g");
  assert.ok(cheese.imageUrl?.startsWith("https://cdn.barbora.lv/products/"));
  // Категория: путь по названиям из дерева сайта.
  assert.equal(cheese.category, "Piena produkti un olas / Siers / Krēmveida siers");

  // Штучный товар: цены за единицу в кг или л нет.
  assert.equal(by["Universālā līme STALWART"].price, 0.47);
  assert.equal(by["Universālā līme STALWART"].oldPrice, 0.79);
  assert.equal(by["Universālā līme STALWART"].unitPrice, null);
  assert.equal(by["Universālā līme STALWART"].unit, null);

  // «2 par 2€» при цене 2,49: цена за комплект, старая цена = 2 × 2,49. Так же пишет Maxima (условие совпадает, товары склеиваются).
  // Цена за кг пересчитана на акцию: 19,15 × 2,00 / (2 × 2,49) = 7,69.
  const chips = by["Kartupeļu čipsi tomātu ĀDAŽU 130g"];
  assert.equal(chips.price, 2);
  assert.equal(chips.oldPrice, 4.98);
  assert.equal(chips.condition, "Cena par 2 gab.");
  assert.equal(chips.unitPrice, 7.69);
  // «2 par 1,89€» (1+1): цена комплекта равна цене одной штуки.
  const surimi = by["Surimi nūjiņas atdzesētas PORTLITE 150g"];
  assert.equal(surimi.price, 1.89);
  assert.equal(surimi.oldPrice, 3.78);
  assert.equal(surimi.condition, "Cena par 2 gab.");
  assert.equal(surimi.unitPrice, 6.3);

  // «2 vai vairāk −30%»: в данных обычная цена 1,56 (сверено с карточкой на сайте), акционная 1,56 × 0,7.
  const tortilla = by["Tortiljas WELL DONE 6gab. 370g"];
  assert.equal(tortilla.price, 1.09);
  assert.equal(tortilla.oldPrice, 1.56);
  // Формат Rimi («4 un vairāk»): только его распознаёт сопоставление (conditionKind → min2).
  assert.equal(tortilla.condition, "2 un vairāk");
  assert.equal(conditionKind(tortilla.condition), "min2");
  assert.equal(conditionKind(chips.condition), "set2");
  assert.equal(tortilla.unitPrice, 2.95);

  // Цена по карте Paldies: условие как у Maxima, срока нет (постоянная цена).
  const cream = by["Skābais krējums VALMIERA 20% 450g"];
  assert.equal(cream.price, 1.99);
  assert.equal(cream.oldPrice, 2.39);
  assert.equal(cream.condition, "Ar PALDIES karti");
  assert.equal(conditionKind(cream.condition), ""); // карта условием не считается
  assert.equal(cream.unitPrice, 4.42);
  assert.equal(cream.endsAt, null);
  assert.equal(by["Kūtī dētas olas ZEMNIEKU A kategorija 10gab."].unitPrice, null);

  // Нет категории или бренда: поля пустые, товар цел (бренд приходит пустой строкой).
  assert.equal(by["Lāpstiņa un cepumu formiņa ILAJA"].category, null);
  assert.equal(by["Sīpoli 45+ kg"].brand, null);
  assert.equal(by["Sīpoli 45+ kg"].category, "Augļi un dārzeņi / Dārzeņi / Sīpoli, puravi un ķiploki");

  // Нет в наличии и без акции: не предложения.
  assert.equal(by["Batoniņš Serenāde LAIMA 40g"], undefined);
  assert.equal(by["Raudzēts piena produkts Graudi LAKTO avene-granola 270g"], undefined);
});

test("parse: позиция с битой ценой считается в invalid, остальные целы", () => {
  const bad = { ...akcijas.inventories[0], id: "1", price: null };
  const { offers, invalid } = parse([...akcijas.inventories, bad], [akcijas.categoryTree]);
  assert.equal(invalid, 1);
  assert.equal(offers.length, 7);
});

// Сервер как настоящий: отдаёт не больше Limit, count — сколько всего. Позиции размножены с другими id.
function server(total: number, drop = 0) {
  const calls: URL[] = [];
  const items = (name: string, n: number) =>
    Array.from({ length: n }, (_, i) => ({ ...load(name).inventories[0], id: `${name}-${i}` }));
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string) => {
    const u = new URL(url);
    calls.push(u);
    const id = u.pathname.split("/").at(-1);
    const all = id === "50XV" ? items("akcijas", total) : items("paldies", 5);
    const off = Number(u.searchParams.get("Offset"));
    const lim = Number(u.searchParams.get("Limit"));
    return Response.json({ count: all.length + (id === "50XV" ? drop : 0), inventories: all.slice(off, off + lim), categoryTree: load(id === "50XV" ? "akcijas" : "paldies").categoryTree });
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = real) };
}

test("scrape: обе коллекции читаются страницами по 200 до конца, дерево берётся из ответа", async () => {
  const s = server(450);
  try {
    const { offers, invalid } = await scrape();
    assert.equal(offers.length, 455);
    assert.equal(invalid, 0);
    // 450 позиций = 3 страницы Akcijas + 1 страница Paldies.
    assert.deepEqual(s.calls.map((u) => `${u.pathname.split("/").at(-1)}:${u.searchParams.get("Offset")}`), ["50XV:0", "50XV:200", "50XV:400", "GAUV:0"]);
    assert.equal(s.calls[0].searchParams.get("Limit"), "200");
  } finally {
    s.restore();
  }
});

test("scrape: сервер отдал меньше, чем обещал count, это сбой, а не тихая потеря товаров", async () => {
  const s = server(10, 3);
  try {
    await assert.rejects(scrape(), /10 из 13/);
  } finally {
    s.restore();
  }
});

test("scrape: count включает ~2% позиций, которые API не отдаёт никогда (живые 1685 из 1729), это не сбой", async () => {
  const s = server(1000, 22);
  try {
    const { offers } = await scrape();
    assert.equal(offers.length, 1005);
  } finally {
    s.restore();
  }
});

test("scrape: формат ответа изменился или нет ни одной акции", async () => {
  const real = globalThis.fetch;
  try {
    globalThis.fetch = (async () => Response.json({ items: [] })) as typeof fetch;
    await assert.rejects(scrape(), /формат/);
    globalThis.fetch = (async () => Response.json({ count: 0, inventories: [], categoryTree: [] })) as typeof fetch;
    await assert.rejects(scrape(), /ни одной акции/);
  } finally {
    globalThis.fetch = real;
  }
});

test("scrape: обрыв соединения повторяется, постоянный сбой и 4xx нет", async () => {
  const real = globalThis.fetch;
  let calls = 0;
  const drop = () => Promise.reject(new TypeError("terminated"));
  const ok = () => Promise.resolve(Response.json({ count: 2, inventories: akcijas.inventories.slice(0, 2), categoryTree: [] }));
  const replies = [drop, drop, ok, ok];
  globalThis.fetch = (() => replies[calls++]()) as typeof fetch;
  try {
    const { offers } = await scrape({ retryMs: 0 });
    // Первый запрос потребовал 3 попытки, второй (Paldies) прошёл с первой.
    assert.equal(calls, 4);
    // Обе коллекции вернули одни и те же id: дубль убран.
    assert.equal(offers.length, 2);

    calls = 0;
    replies.splice(0, 4, drop, drop, drop);
    await assert.rejects(scrape({ retryMs: 0 }), /terminated/);
    assert.equal(calls, 3);

    calls = 0;
    replies.splice(0, 3, () => Promise.resolve(new Response("", { status: 403 })));
    await assert.rejects(scrape({ retryMs: 0 }), /HTTP 403/);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = real;
  }
});
