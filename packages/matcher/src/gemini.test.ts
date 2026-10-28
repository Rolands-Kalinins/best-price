import assert from "node:assert/strict";
import { test } from "node:test";
import { askGemini } from "./gemini";

const ok = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });
const opts = (fetchFn: typeof fetch) => ({ apiKey: "SECRET-KEY", model: "m1", fetch: fetchFn, sleep: async () => {} });
const schema = { type: "ARRAY" };

test("askGemini: ключ только в заголовке, температура 0, схема и текст пробрасываются", async () => {
  let url = "", init: RequestInit = {};
  const text = await askGemini("prompt", schema, opts(async (u, i) => ((url = String(u)), (init = i!), ok("[1]"))));
  assert.equal(text, "[1]");
  assert.ok(url.endsWith("/models/m1:generateContent"));
  assert.ok(!url.includes("SECRET-KEY"));
  assert.equal((init.headers as Record<string, string>)["x-goog-api-key"], "SECRET-KEY");
  const body = JSON.parse(String(init.body));
  assert.equal(body.generationConfig.temperature, 0);
  assert.equal(body.generationConfig.responseMimeType, "application/json");
  assert.deepEqual(body.generationConfig.responseSchema, schema);
  assert.equal(body.contents[0].parts[0].text, "prompt");
});

test("askGemini: 429 и 5xx повторяются, потом успех", async () => {
  const codes = [429, 503];
  let calls = 0;
  const text = await askGemini("p", schema, opts(async () => (calls++, codes.length ? new Response("", { status: codes.shift()! }) : ok("[]"))));
  assert.equal(text, "[]");
  assert.equal(calls, 3);
});

test("askGemini: после трёх попыток и при 4xx — исключение без ключа в тексте", async () => {
  let calls = 0;
  await assert.rejects(askGemini("p", schema, opts(async () => (calls++, new Response("", { status: 429 })))), (e: Error) => !e.message.includes("SECRET-KEY"));
  assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(askGemini("p", schema, opts(async () => (calls++, new Response("bad", { status: 400 })))), /400/);
  assert.equal(calls, 1); // 400 не повторяем
});

test("askGemini: пустой ответ (кандидатов нет) — исключение", async () => {
  await assert.rejects(askGemini("p", schema, opts(async () => new Response(JSON.stringify({ candidates: [] }), { status: 200 }))), /пуст/i);
});
