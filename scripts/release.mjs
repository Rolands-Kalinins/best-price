// Помощник релиза: порядок слияния веток, проверка миграций и версии, заметки релиза.
// Использование: node scripts/release.mjs plan | check [база] | notes <версия>
import { execSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// Порядок слияния: общее (core) раньше тех, кто от него зависит; миграции до кода, который читает новые столбцы.
const RANK = { core: 0, migration: 1, scraper: 2, web: 3, ci: 4, docs: 5, other: 6 };

export function classify(file) {
  if (file.startsWith("supabase/migrations/")) return "migration";
  if (file.startsWith("packages/core/")) return "core";
  if (file.startsWith("packages/scrapers/")) return "scraper";
  if (file.startsWith("apps/web/")) return "web";
  if (file.startsWith(".github/")) return "ci";
  if (file.startsWith("docs/") || file.startsWith("tasks/") || file.endsWith(".md")) return "docs";
  return "other";
}

/** branches: [{ name, files }] → порядок слияния, файлы, которые меняют несколько веток, и ветки с миграциями. */
export function plan(branches) {
  const rank = (b) => Math.min(RANK.other, ...b.files.map((f) => RANK[classify(f)]));
  const order = [...branches].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)).map((b) => b.name);
  const byFile = new Map();
  for (const b of branches) for (const f of b.files) byFile.set(f, [...(byFile.get(f) ?? []), b.name]);
  const overlaps = [...byFile].filter(([, names]) => names.length > 1).map(([file, names]) => ({ file, branches: names }));
  const migrations = branches.filter((b) => b.files.some((f) => classify(f) === "migration")).map((b) => b.name);
  return { order, overlaps, migrations };
}

export function checkMigrations(names) {
  const errors = [];
  const stamps = new Set();
  for (const n of names) {
    if (!/^\d{14}_[a-z0-9_]+\.sql$/.test(n)) errors.push(`${n}: имя должно быть ГГГГММДДЧЧММСС_слово.sql (строчные буквы, цифры, _)`);
    const stamp = n.slice(0, 14);
    if (stamps.has(stamp)) errors.push(`${n}: метка времени ${stamp} уже есть у другой миграции`);
    stamps.add(stamp);
  }
  return errors;
}

/** Операции, которые ломают ещё не обновлённый код: такую миграцию делят на два релиза (сначала код, потом удаление). */
export function riskyMigration(sql) {
  return sql.match(/drop\s+(?:table|column|schema)|truncate|rename\s+(?:to|column)|alter\s+column\s+\S+\s+(?:set\s+not\s+null|type)/gi) ?? [];
}

/** Любое изменение кода, схемы или CI требует новой версии (правило CLAUDE.md); только документация нет. */
export function versionBumped(files) {
  const code = files.some((f) => /^(apps|packages|supabase|\.github|scripts)\//.test(f));
  return !code || files.includes("VERSION");
}

export function changelogNotes(md, version) {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => l.startsWith(`## ${version}`));
  if (start < 0) return "";
  const end = lines.findIndex((l, i) => i > start && l.startsWith("## "));
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n").trim();
}

const git = (cmd) => execSync(`git ${cmd}`, { encoding: "utf8" }).trim();

function cli(cmd, arg) {
  if (cmd === "notes") {
    process.stdout.write(changelogNotes(readFileSync("docs/CHANGELOG.md", "utf8"), arg));
    return 0;
  }
  if (cmd === "plan") {
    const names = git("for-each-ref --format=%(refname:short) refs/heads refs/remotes/origin")
      .split("\n").filter((n) => n && !/(^|\/)(main|HEAD)$/.test(n) && n !== "origin");
    // Ветка есть и локально, и на сервере — берём локальную.
    const unique = names.filter((n) => !n.startsWith("origin/") || !names.includes(n.slice(7)));
    const branches = unique
      .map((name) => ({ name, files: git(`diff --name-only main...${name}`).split("\n").filter(Boolean) }))
      .filter((b) => b.files.length);
    const out = plan(branches);
    console.log("## План слияния\n");
    console.log(out.order.length ? out.order.map((n, i) => `${i + 1}. ${n}`).join("\n") : "Нет веток с изменениями относительно main.");
    if (out.migrations.length) console.log(`\n⚠ Миграции в ветках: ${out.migrations.join(", ")}. Бэкап и применение к боевой БД до слияния кода.`);
    for (const o of out.overlaps) console.log(`\n⚠ ${o.file} меняют: ${o.branches.join(", ")} (риск конфликта)`);
    return 0;
  }
  if (cmd === "check") {
    const base = arg ?? "origin/main";
    const changed = git(`diff --name-only ${base}...HEAD`).split("\n").filter(Boolean);
    const errors = checkMigrations(readdirSync("supabase/migrations").filter((n) => n.endsWith(".sql")).sort());
    const lines = ["## Проверка релиза\n"];
    const newMigrations = changed.filter((f) => classify(f) === "migration");
    if (newMigrations.length) {
      lines.push(`⚠ Миграции в изменениях: ${newMigrations.map((f) => f.split("/").pop()).join(", ")}. Применить к боевой БД **до** слияния (бэкап, затем get_advisors).`);
      for (const f of newMigrations) {
        const risky = riskyMigration(readFileSync(f, "utf8"));
        if (risky.length) lines.push(`⚠ ${f}: ${risky.join(", ")}. Несовместимо со старым кодом: разделить на два релиза.`);
      }
    }
    if (!versionBumped(changed)) errors.push("VERSION не изменён: поднимите версию и добавьте запись в docs/CHANGELOG.md");
    lines.push(...errors.map((e) => `❌ ${e}`));
    if (!errors.length) lines.push("✅ Имена миграций и версия в порядке.");
    console.log(lines.join("\n"));
    return errors.length ? 1 : 0;
  }
  console.error("Использование: node scripts/release.mjs plan | check [база] | notes <версия>");
  return 2;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = cli(process.argv[2], process.argv[3]);
