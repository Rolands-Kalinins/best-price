import assert from "node:assert/strict";
import { test } from "node:test";
import { askGemini, GeminiError } from "./gemini";

const ok = (text: string, usageMetadata?: object) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }], usageMetadata }), { status: 200 });
const opts = (fetchFn: typeof fetch) => ({ apiKey: "SECRET-KEY", model: "m1", fetch: fetchFn, sleep: async () => {} });
const schema = { type: "ARRAY" };

test("askGemini: ключ только в заголовке, температура 0, схема и текст пробрасываются", async () => {
  let url = "", init: RequestInit = {};
  const r = await askGemini("prompt", schema, opts(async (u, i) => ((url = String(u)), (init = i!), ok("[1]"))));
  assert.equal(r.text, "[1]");
  assert.ok(url.endsWith("/models/m1:generateContent"));
  assert.ok(!url.includes("SECRET-KEY"));
  assert.equal((init.headers as Record<string, string>)["x-goog-api-key"], "SECRET-KEY");
  const body = JSON.parse(String(init.body));
  assert.equal(body.generationConfig.temperature, 0);
  assert.equal(body.generationConfig.responseMimeType, "application/json");
  assert.deepEqual(body.generationConfig.responseSchema, schema);
  assert.equal(body.contents[0].parts[0].text, "prompt");
});

test("askGemini: токены из usageMetadata (вывод = всего − вход, мысли модели входят в вывод); нет метаданных — нули", async () => {
  const a = await askGemini("p", schema, opts(async () => ok("[]", { promptTokenCount: 154, candidatesTokenCount: 123, totalTokenCount: 300 })));
  assert.deepEqual([a.tokensIn, a.tokensOut], [154, 146]);
  const b = await askGemini("p", schema, opts(async () => ok("[]")));
  assert.deepEqual([b.tokensIn, b.tokensOut], [0, 0]);
  const c = await askGemini("p", schema, opts(async () => ok("[]", { promptTokenCount: "x", totalTokenCount: null })));
  assert.deepEqual([c.tokensIn, c.tokensOut], [0, 0]); // мусор вместо чисел не ломает запуск
});

test("askGemini: 429 и 5xx повторяются, потом успех", async () => {
  const codes = [429, 503];
  let calls = 0;
  const r = await askGemini("p", schema, opts(async () => (calls++, codes.length ? new Response("", { status: codes.shift()! }) : ok("[]"))));
  assert.equal(r.text, "[]");
  assert.equal(calls, 3);
  assert.equal(r.attempts, 3); // каждый HTTP-запрос идёт в суточную квоту, включая неудачные
});

test("askGemini: битое тело ответа 200 — как сбой попытки: повтор и учёт запроса", async () => {
  let calls = 0;
  const r = await askGemini("p", schema, opts(async () => (calls++, calls === 1 ? new Response("не json", { status: 200 }) : ok("[]"))));
  assert.equal(r.text, "[]");
  assert.equal(r.attempts, 2);
  await assert.rejects(askGemini("p", schema, opts(async () => new Response("не json", { status: 200 }))), (e: unknown) => e instanceof GeminiError && e.attempts === 3);
});

test("askGemini: после трёх попыток — GeminiError со статусом 429 и без ключа в тексте; 4xx не повторяем", async () => {
  let calls = 0;
  await assert.rejects(askGemini("p", schema, opts(async () => (calls++, new Response("", { status: 429 })))), (e: unknown) => {
    assert.ok(e instanceof GeminiError);
    assert.equal(e.status, 429);
    assert.equal(e.attempts, 3);
    assert.ok(!e.message.includes("SECRET-KEY"));
    return true;
  });
  assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(askGemini("p", schema, opts(async () => (calls++, new Response("bad", { status: 400 })))), (e: unknown) => e instanceof GeminiError && e.status === 400);
  assert.equal(calls, 1); // 400 не повторяем
});

test("askGemini: сетевой сбой — GeminiError со статусом 0; пустой ответ — исключение", async () => {
  await assert.rejects(askGemini("p", schema, opts(async () => Promise.reject(new Error("fetch failed")))), (e: unknown) => e instanceof GeminiError && e.status === 0);
  await assert.rejects(askGemini("p", schema, opts(async () => new Response(JSON.stringify({ candidates: [] }), { status: 200 }))), /пуст/i);
});
