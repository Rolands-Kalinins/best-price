import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { SCRAPE_CRON, SCRAPE_CRONS, formatCountdown, nextRunAt, nextScrapeAt, staleAfterHours } from "./scrape-schedule";

test("nextScrapeAt: до 22:17 UTC — сегодня, после — завтра", () => {
  assert.equal(nextScrapeAt(new Date("2026-10-30T10:00:00Z")).toISOString(), "2026-10-30T22:17:00.000Z");
  assert.equal(nextScrapeAt(new Date("2026-10-30T22:17:00Z")).toISOString(), "2026-10-31T22:17:00.000Z");
  assert.equal(nextScrapeAt(new Date("2026-12-31T23:00:00Z")).toISOString(), "2027-01-01T22:17:00.000Z");
});

test("formatCountdown", () => {
  assert.equal(formatCountdown(0), "0 с");
  assert.equal(formatCountdown(59), "59 с");
  assert.equal(formatCountdown(3725), "1 ч 02 мин 05 с");
  assert.equal(formatCountdown(-5), "0 с");
});

test("SCRAPE_CRON и все cron магазинов совпадают с cron в scrape.yml", () => {
  const yml = readFileSync(new URL("../../../.github/workflows/scrape.yml", import.meta.url), "utf8");
  assert.ok(yml.includes(`- cron: "${SCRAPE_CRON}"`));
  const declared = [...yml.matchAll(/- cron: "([^"]+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual([...SCRAPE_CRONS].sort(), declared); // в yml нет cron, о котором не знает core, и наоборот
});

// 2026-11-16 — понедельник (UTC).
test("nextRunAt: у каждого магазина своё расписание", () => {
  const mon = new Date("2026-11-16T10:00:00Z");
  assert.equal(nextRunAt("maxima", mon).toISOString(), "2026-11-16T22:17:00.000Z"); // каждую ночь
  assert.equal(nextRunAt("lidl", mon).toISOString(), "2026-11-22T22:47:00.000Z"); // раз в неделю, ночью на понедельник
  assert.equal(nextRunAt("lidl", new Date("2026-11-22T22:47:00Z")).toISOString(), "2026-11-29T22:47:00.000Z");
  assert.equal(nextRunAt("rimi", new Date("2026-11-13T10:00:00Z")).toISOString(), "2026-11-14T22:27:00.000Z"); // пт → сб
  assert.equal(nextRunAt("apotheka", mon).toISOString(), "2026-11-17T22:37:00.000Z"); // вт
  assert.equal(nextRunAt("euroaptieka", new Date("2026-11-19T23:00:00Z")).toISOString(), "2026-11-22T22:37:00.000Z"); // после чт → вс
  assert.equal(nextRunAt("неизвестный", mon).toISOString(), "2026-11-16T22:17:00.000Z"); // по умолчанию каждую ночь
});

test("staleAfterHours: самая длинная пауза расписания плюс сутки", () => {
  assert.equal(staleAfterHours("maxima"), 48);
  assert.equal(staleAfterHours("rimi"), 96); // вс, вт, ср, сб: пауза до 3 суток
  assert.equal(staleAfterHours("apotheka"), 96); // вс, вт, чт: пауза до 3 суток
  assert.equal(staleAfterHours("lidl"), 192); // раз в неделю
});
