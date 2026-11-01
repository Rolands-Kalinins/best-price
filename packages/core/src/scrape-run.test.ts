import assert from "node:assert/strict";
import { test } from "node:test";
import { runScrape } from "./scrape-run";

// Поддельный клиент: sources → {id: 7}, scrape_runs.insert пишет в журнал.
function fakeSb(logError: string | null = null) {
  const log: Record<string, unknown>[] = [];
  const sb = {
    from: (table: string) =>
      table === "sources"
        ? { select: () => ({ eq: () => ({ single: async () => ({ data: { id: 7 }, error: null }) }) }) }
        : { insert: async (row: Record<string, unknown>) => (log.push(row), { error: logError ? { message: logError } : null }) },
  };
  return { sb: sb as never, log };
}

const quiet = () => {};

test("успех: пишет success со счётчиками и отдаёт source id в work", async () => {
  const { sb, log } = fakeSb();
  let seen: number | undefined;
  const ok = await runScrape({ slug: "x", label: "X", noun: "акций", sb, say: quiet, work: async ({ sourceId }) => ((seen = sourceId), { count: 5, invalid: 2 }) });
  assert.equal(ok, true);
  assert.equal(seen, 7);
  assert.deepEqual({ ...log[0], started_at: undefined }, { source_id: 7, started_at: undefined, status: "success", items_count: 5, invalid_count: 2, error: null });
});

test("сбой work: пишет failed с текстом ошибки и возвращает false", async () => {
  const { sb, log } = fakeSb();
  const ok = await runScrape({ slug: "x", label: "X", noun: "акций", sb, say: quiet, work: async () => { throw new Error("boom"); } });
  assert.equal(ok, false);
  assert.equal(log[0].status, "failed");
  assert.equal(log[0].error, "boom");
  assert.equal(log[0].items_count, 0);
});

test("ошибка не-Error сериализуется в JSON", async () => {
  const { sb, log } = fakeSb();
  await runScrape({ slug: "x", label: "X", noun: "акций", sb, say: quiet, work: async () => { throw { message: "pg" }; } });
  assert.equal(log[0].error, '{"message":"pg"}');
});

test("сбой записи журнала тоже даёт false", async () => {
  const { sb } = fakeSb("db down");
  const ok = await runScrape({ slug: "x", label: "X", noun: "акций", sb, say: quiet, work: async () => ({ count: 1, invalid: 0 }) });
  assert.equal(ok, false);
});
