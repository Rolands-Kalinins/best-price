import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { SCRAPE_CRON, formatCountdown, nextScrapeAt } from "./scrape-schedule";

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

test("SCRAPE_CRON совпадает с cron в scrape.yml", () => {
  const yml = readFileSync(new URL("../../../.github/workflows/scrape.yml", import.meta.url), "utf8");
  assert.ok(yml.includes(`- cron: "${SCRAPE_CRON}"`));
});
