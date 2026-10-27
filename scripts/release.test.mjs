import assert from "node:assert/strict";
import { test } from "node:test";
import { changelogNotes, checkMigrations, classify, plan, riskyMigration, versionBumped } from "./release.mjs";

test("classify: тип по пути", () => {
  assert.equal(classify("supabase/migrations/20261027120000_x.sql"), "migration");
  assert.equal(classify("packages/core/src/offer.ts"), "core");
  assert.equal(classify("packages/scrapers/rimi/src/index.ts"), "scraper");
  assert.equal(classify("apps/web/app/page.tsx"), "web");
  assert.equal(classify(".github/workflows/ci.yml"), "ci");
  assert.equal(classify("docs/PLAN.md"), "docs");
  assert.equal(classify("README.md"), "docs");
  assert.equal(classify("package.json"), "other");
});

test("plan: порядок core, миграции, парсеры, сайт, CI, документация; пересечения файлов", () => {
  const out = plan([
    { name: "feat/web", files: ["apps/web/a.tsx", "packages/core/src/x.ts"] },
    { name: "docs/x", files: ["docs/PLAN.md"] },
    { name: "feat/rimi", files: ["packages/scrapers/rimi/a.ts", "supabase/migrations/20261027120000_a.sql"] },
    { name: "feat/core", files: ["packages/core/src/x.ts"] },
  ]);
  // feat/web трогает core, поэтому идёт вместе с core-ветками, раньше парсеров
  assert.deepEqual(out.order, ["feat/core", "feat/web", "feat/rimi", "docs/x"]);
  assert.deepEqual(out.overlaps, [{ file: "packages/core/src/x.ts", branches: ["feat/web", "feat/core"] }]);
  assert.deepEqual(out.migrations, ["feat/rimi"]);
});

test("plan: пустой список и ветки без файлов", () => {
  assert.deepEqual(plan([]), { order: [], overlaps: [], migrations: [] });
  assert.deepEqual(plan([{ name: "a", files: [] }]).order, ["a"]);
});

test("checkMigrations: имя, уникальность и порядок меток времени", () => {
  assert.deepEqual(checkMigrations(["20261025100000_core.sql", "20261025110000_grocery.sql"]), []);
  assert.equal(checkMigrations(["bad.sql"]).length, 1);
  assert.equal(checkMigrations(["20261025100000_a.sql", "20261025100000_b.sql"]).length, 1); // одна метка дважды
  assert.equal(checkMigrations(["20261025100000_Core.sql"]).length, 1); // заглавные
});

test("riskyMigration: несовместимое со старым кодом", () => {
  assert.equal(riskyMigration("alter table t drop column x;").length, 1);
  assert.equal(riskyMigration("drop table t;").length, 1);
  assert.equal(riskyMigration("alter table t alter column x set not null;").length, 1);
  assert.equal(riskyMigration("alter table t rename column a to b;").length, 1);
  assert.deepEqual(riskyMigration("alter table t add column x int; drop policy p on t;"), []);
});

test("versionBumped: изменения кода требуют новой версии, документация нет", () => {
  assert.equal(versionBumped(["docs/PLAN.md"]), true);
  assert.equal(versionBumped(["apps/web/a.tsx"]), false);
  assert.equal(versionBumped(["apps/web/a.tsx", "VERSION", "docs/CHANGELOG.md"]), true);
  assert.equal(versionBumped(["supabase/migrations/20261027120000_a.sql"]), false);
  assert.equal(versionBumped([]), true);
});

test("changelogNotes: раздел нужной версии", () => {
  const md = "# Журнал\n\n## 1.1.0.0 — 2026-10-27\n- Rimi\n- лента\n\n## 1.0.0.0 — 2026-10-25\n- старое\n";
  assert.equal(changelogNotes(md, "1.1.0.0"), "- Rimi\n- лента");
  assert.equal(changelogNotes(md, "1.0.0.0"), "- старое");
  assert.equal(changelogNotes(md, "9.9.9.9"), "");
});
