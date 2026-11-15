import assert from "node:assert/strict";
import { test } from "node:test";
import { FetchError, fetchRetry, isBlockedPage, requireShare, retryAfterMs } from "./fetch-retry";

const reply = (status: number, body: string, headers: Record<string, string> = {}) => new Response(body, { status, headers });
const base = { name: "Тест", retryMs: 0, read: (t: string) => JSON.parse(t) as { ok: boolean } };

// Подменяем fetch очередью ответов; возвращаем число вызовов.
function queue(...items: (Response | Error)[]) {
  let calls = 0;
  globalThis.fetch = (async () => {
    const it = items[Math.min(calls++, items.length - 1)];
    if (it instanceof Error) throw it;
    return it.clone();
  }) as typeof fetch;
  return () => calls;
}

test("успех с первого раза", async () => {
  const calls = queue(reply(200, '{"ok":true}'));
  assert.deepEqual(await fetchRetry("http://x", base), { ok: true });
  assert.equal(calls(), 1);
});

test("5xx и 429 повторяются, потом успех", async () => {
  const calls = queue(reply(503, "down"), reply(429, "slow"), reply(200, '{"ok":true}'));
  assert.deepEqual(await fetchRetry("http://x", base), { ok: true });
  assert.equal(calls(), 3);
});

test("404 не повторяется и называет класс http", async () => {
  const calls = queue(reply(404, "no"));
  await assert.rejects(fetchRetry("http://x", base), (e: FetchError) => e.kind === "http" && /Тест: HTTP 404/.test(e.message));
  assert.equal(calls(), 1);
});

test("gone: 404 даёт null без повторов", async () => {
  queue(reply(404, "no"));
  assert.equal(await fetchRetry("http://x", { ...base, gone: [404] }), null);
});

test("обрыв сети повторяется до предела, потом сетевой сбой", async () => {
  const calls = queue(new TypeError("terminated"));
  await assert.rejects(fetchRetry("http://x", { ...base, attempts: 3 }), (e: FetchError) => e.kind === "network");
  assert.equal(calls(), 3);
});

test("страница Cloudflare при коде 200: blocked, повторов нет", async () => {
  const calls = queue(reply(200, "<html><title>Just a moment...</title><script src='/cdn-cgi/challenge-platform/h/b'></script>"));
  await assert.rejects(fetchRetry("http://x", base), (e: FetchError) => e.kind === "blocked" && /^\[blocked\] Тест/.test(e.message));
  assert.equal(calls(), 1);
});

test("403 с заглушкой DataDome: blocked; голый 403: http", async () => {
  queue(reply(403, "<iframe src='https://geo.captcha-delivery.com/x'>"));
  await assert.rejects(fetchRetry("http://x", base), (e: FetchError) => e.kind === "blocked");
  queue(reply(403, "forbidden"));
  await assert.rejects(fetchRetry("http://x", base), (e: FetchError) => e.kind === "http");
});

test("исчерпанные 429 дают класс rate", async () => {
  queue(reply(429, "slow"));
  await assert.rejects(fetchRetry("http://x", { ...base, attempts: 2 }), (e: FetchError) => e.kind === "rate");
});

test("Retry-After: секунды и дата, потолок", () => {
  assert.equal(retryAfterMs("7"), 7000);
  assert.equal(retryAfterMs("100000"), 120_000);
  assert.equal(retryAfterMs(null), 0);
  assert.equal(retryAfterMs("мусор"), 0);
  const d = new Date(Date.now() + 10_000).toUTCString();
  const ms = retryAfterMs(d);
  assert.ok(ms > 7000 && ms <= 10_000);
});

test("обычная страница магазина не считается заглушкой", () => {
  assert.equal(isBlockedPage('<html><title>Rimi akcijas</title><div class="product">Piens</div>'), false);
});

test("requireShare: доля поля ниже порога — сбой с именем поля", () => {
  const items = [{ c: "a" }, { c: null }, { c: "b" }, { c: "" }];
  requireShare("Тест", items, "category", (i) => i.c, 0.5);
  assert.throws(() => requireShare("Тест", items, "category", (i) => i.c, 0.6), /Тест: поле category есть у 2 из 4/);
  requireShare("Тест", [], "category", () => null, 0.9); // пустой список проверяет minProducts, не это
});
