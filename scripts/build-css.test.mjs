import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

// Проверка собранного CSS сайта (apps/web/.next после pnpm build): в боевой сборке на Vercel однажды оказался
// старый светлый шаблон вместо нашей темы (docs/findings/2026-10-27-stale-css-vercel-cache.md). Без сборки тест пропускается.
const dir = process.env.BUILD_CSS_DIR ?? "apps/web/.next/static/chunks";
const css = existsSync(dir)
  ? readdirSync(dir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(`${dir}/${f}`, "utf8")).join("\n")
  : null;

test("собранный CSS: наша тема, а не шаблон shadcn по умолчанию", { skip: css === null && "нет сборки (pnpm build)" }, () => {
  assert.match(css, /prefers-color-scheme:\s*dark/, "нет тёмной темы по системной настройке");
  assert.match(css, /--sale:/, "нет цвета скидки (--sale)");
  assert.doesNotMatch(css, /--background:#fff[;}]/, "остался шаблонный светлый фон shadcn (--background:#fff)");
  assert.doesNotMatch(css, /\.dark\{--background/, "остался шаблонный класс .dark");
});

test("собранный CSS: отступ прокрутки под закреплённые шапку и поиск (фокус не уходит под них)", { skip: css === null && "нет сборки (pnpm build)" }, () => {
  assert.match(css, /scroll-padding-top:\s*7rem/);
});
