import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyUsage, pacificDay, recordFailure, recordSuccess, secondsUntilReset, usagePercent } from "./ai-usage";

test("recordSuccess: запросы (с повторами) и токены накапливаются", () => {
  const u = emptyUsage();
  recordSuccess(u, { attempts: 2, tokensIn: 100, tokensOut: 30 });
  recordSuccess(u, { attempts: 1, tokensIn: 50, tokensOut: 10 });
  assert.deepEqual(u, { ...emptyUsage(), requests: 3, tokensIn: 150, tokensOut: 40 });
});

test("recordFailure: 429 отмечает квоту, другая ошибка — нет; запросы берутся из ошибки, неизвестно — один", () => {
  const now = new Date("2026-10-28T10:00:00Z");
  const u = emptyUsage();
  recordFailure(u, { message: "Gemini: 3 попытки не удались (Gemini HTTP 429)", status: 429, attempts: 3 }, now);
  assert.deepEqual([u.requests, u.errors, u.quotaHits, u.quotaHitAt], [3, 1, 1, "2026-10-28T10:00:00.000Z"]);
  recordFailure(u, { message: "Gemini HTTP 400", status: 400, attempts: 1 }, now);
  assert.deepEqual([u.requests, u.errors, u.quotaHits], [4, 2, 1]);
  recordFailure(u, new Error("странный сбой вне клиента"), now); // не GeminiError: сколько запросов ушло, неизвестно — считаем один
  assert.deepEqual([u.requests, u.errors, u.quotaHits], [5, 3, 1]);
  assert.equal(u.lastError, "странный сбой вне клиента");
  recordFailure(u, { message: "x".repeat(500), status: 0, attempts: 3 }, now);
  assert.equal(u.lastError!.length, 200); // в базе одна строка, не простыня
});

// Суточный лимит Google сбрасывается в полночь по тихоокеанскому времени: летом UTC−7, зимой UTC−8.
test("pacificDay: граница дня — полночь по Лос-Анджелесу, летом и зимой", () => {
  assert.equal(pacificDay(new Date("2026-10-28T06:59:59Z")), "2026-10-27"); // 23:59:59 PDT
  assert.equal(pacificDay(new Date("2026-10-28T07:00:00Z")), "2026-10-28"); // 00:00:00 PDT
  assert.equal(pacificDay(new Date("2026-12-01T07:59:59Z")), "2026-11-30"); // 23:59:59 PST
  assert.equal(pacificDay(new Date("2026-12-01T08:00:00Z")), "2026-12-01"); // 00:00:00 PST
});

test("secondsUntilReset: до следующей тихоокеанской полуночи", () => {
  assert.equal(secondsUntilReset(new Date("2026-10-28T06:30:00Z")), 1800);
  assert.equal(secondsUntilReset(new Date("2026-10-28T07:00:00Z")), 86400); // ровно полночь — целые сутки до следующей
  assert.equal(secondsUntilReset(new Date("2026-12-01T07:00:00Z")), 3600);
});

test("usagePercent: целые проценты, без деления на ноль, не больше 100", () => {
  assert.equal(usagePercent(42, 500), 8);
  assert.equal(usagePercent(500, 500), 100);
  assert.equal(usagePercent(900, 500), 100); // превышение показываем как 100
  assert.equal(usagePercent(5, 0), 0); // лимит не задан
  assert.equal(usagePercent(0, 500), 0);
});
