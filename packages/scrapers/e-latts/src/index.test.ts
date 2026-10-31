import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parse, scrape } from "./index";

const html = readFileSync("fixtures/sale.html", "utf8");
// В фикстуре 7 акций, порог «слишком мало» (200) в тестах отключён, кроме одного.
const fast = { pauseMs: 0, minOffers: 1 };

test("parse: акции e-latts на реальных плитках", () => {
  const { offers, invalid } = parse(html);
  // 10 плиток: 2 без старой цены и 1 алкоголь пропущены, остальные 7 целы.
  assert.equal(invalid, 0);
  assert.equal(offers.length, 7);
  const by = Object.fromEntries(offers.map((o) => [o.externalId, o]));

  // Обычная акция: цена и старая цена с плитки, цена за кг как на сайте, срока нет (действует, пока парсер видит строку).
  const grain = by["939"];
  assert.equal(grain.title, "Putraimi miežu 800g, Tautas");
  assert.equal(grain.price, 0.79);
  assert.equal(grain.oldPrice, 1.1);
  assert.equal(grain.unitPrice, 0.99);
  assert.equal(grain.unit, "kg");
  assert.equal(grain.condition, null);
  assert.equal(grain.startsAt, null);
  assert.equal(grain.endsAt, null);
  assert.equal(grain.ean, null);
  assert.equal(grain.url, "https://e-latts.lv/putraimi-miezu-800g-tautas.939.p");
  assert.equal(grain.imageUrl, "https://e-latts.lv/i/putraimi-miezu-800g-tautas.spm.913-m1X.jpeg");
  // Категория путём « / », как у Barbora: changedCategories смотрит на последний сегмент.
  assert.equal(grain.category, "Bakaleja / Putraimi / Kviešu, rudzu, miežu putraimi");

  // Литры, и депозит тары в цену не входит (0,10 € лежит отдельной строкой).
  assert.equal(by["22889"].price, 1.79);
  assert.equal(by["22889"].oldPrice, 1.99);
  assert.equal(by["22889"].unitPrice, 0.9);
  assert.equal(by["22889"].unit, "l");

  // Цены за кг или л нет: товар штучный («/ gab») или единицы нет вовсе.
  assert.equal(by["2315"].unitPrice, null);
  assert.equal(by["2315"].unit, null);
  const pads = offers.find((o) => o.title.startsWith("Higiēniskās paketes"))!;
  assert.equal(pads.price, 3.15);
  assert.equal(pads.unitPrice, null);
  assert.equal(pads.unit, null);

  // Длинное название: у ссылки класс «-oTitle -sLong», а не «-oTitle» (4 из 438 акций терялись).
  assert.equal(by["15384"].title, "Graudu masījums pērļu grūbu, linsēklu ar saulē kaltētiem tomātiem 4x90g, Gudrie Graudi");

  // Без старой цены скидки не видно: не акция. Алкоголь не берём совсем.
  assert.ok(!by["1669"] && !by["2088"]);
  assert.ok(!offers.some((o) => o.title.startsWith("Alus")));
});

test("parse: плитка без цены считается отброшенной, а не акцией", () => {
  const broken = html.replace(/-oPrice" -price="0\.79"/, 'x" -price=""');
  const { offers, invalid } = parse(broken);
  assert.equal(invalid, 1);
  assert.equal(offers.length, 6);
});

test("parse: HTML-сущности в названии раскрываются", () => {
  const { offers } = parse(html.replace("Putraimi miežu 800g, Tautas", "Lay&#039;s &amp; Co"));
  assert.ok(offers.some((o) => o.title === "Lay's & Co"));
});

// Сервер отдаёт страницу по ?p=N, пока есть плитки; после конца пустая страница.
function server(pages: string[]) {
  const real = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (url: string | URL | Request) => {
    const u = new URL(String(url));
    calls.push(`${u.pathname}${u.search}`);
    return new Response(pages[Number(u.searchParams.get("p")) - 1] ?? "<html></html>");
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = real) };
}

test("scrape: страницы читаются до пустой, одинаковые товары склеиваются", async () => {
  const s = server([html, html]);
  try {
    const { offers, invalid } = await scrape(fast);
    assert.equal(offers.length, 7);
    assert.equal(invalid, 0);
    assert.deepEqual(s.calls, ["/products.sale.ppl?p=1", "/products.sale.ppl?p=2", "/products.sale.ppl?p=3"]);
  } finally {
    s.restore();
  }
});

test("scrape: нет плиток на первой странице — формат сайта изменился", async () => {
  const s = server([]);
  try {
    await assert.rejects(scrape(fast), /формат/);
  } finally {
    s.restore();
  }
});

test("scrape: много отброшенных плиток — сбой по порогу", async () => {
  const s = server([html.replace(/-oPrice" -price="[\d.]+"/g, 'x" -price=""')]);
  try {
    await assert.rejects(scrape(fast), /не разобрано/);
  } finally {
    s.restore();
  }
});

test("scrape: обрыв соединения повторяется, 4xx нет", async () => {
  const real = globalThis.fetch;
  let calls = 0;
  const replies = [
    () => Promise.reject(new TypeError("terminated")),
    () => Promise.resolve(new Response(html)),
    () => Promise.resolve(new Response("<html></html>")),
  ];
  globalThis.fetch = (() => replies[calls++]()) as typeof fetch;
  try {
    const { offers } = await scrape({ ...fast, retryMs: 0 });
    assert.equal(calls, 3);
    assert.equal(offers.length, 7);

    calls = 0;
    replies.splice(0, 3, () => Promise.resolve(new Response("", { status: 403 })));
    await assert.rejects(scrape({ ...fast, retryMs: 0 }), /HTTP 403/);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = real;
  }
});

test("scrape: акций гораздо меньше обычного (оборванный обход) — сбой, а не тихий успех", async () => {
  const s = server([html]);
  try {
    await assert.rejects(scrape({ pauseMs: 0 }), /мало акций/);
  } finally {
    s.restore();
  }
});

test("parse: сущности — шестнадцатеричные раскрываются, битые не роняют разбор", () => {
  const { offers, invalid } = parse(html.replace("Putraimi miežu 800g, Tautas", "Lay&#x27;s &#99999999; Co"));
  assert.equal(invalid, 0);
  assert.ok(offers.some((o) => o.title === "Lay's &#99999999; Co"));
});

test("parse: алкоголь отсекается без учёта регистра и диакритики", () => {
  const swapped = html.replace(/Alkoholiskie dzērieni\/Alus/, "ALKOHOLISKIE DZERIENI/Alus");
  assert.ok(!parse(swapped).offers.some((o) => o.title.startsWith("Alus")));
});

test("parse: у плитки лишний класс — она всё равно читается", () => {
  const { offers } = parse(html.replace('class="-oProduct"  -id="939"', 'class="-oProduct -sPromo" -id="939"').replace('class="-oProduct" -id="939"', 'class="-oProduct -sPromo" -id="939"'));
  assert.ok(offers.some((o) => o.externalId === "939"));
});
