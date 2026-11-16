import { readFileSync } from "node:fs";
import type { NextConfig } from "next";
import { securityHeaders } from "./security-headers";

// Версия приложения: файл VERSION в корне репозитория (источник правды, CLAUDE.md). Нет файла (сборка вне репозитория) — подвал без номера.
let version = "";
try {
  version = readFileSync(new URL("../../VERSION", import.meta.url), "utf8").trim();
} catch {}

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_APP_VERSION: version },
  headers: async () => [
    { source: "/:path*", headers: securityHeaders({ supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, dev: process.env.NODE_ENV !== "production" }) },
  ],
  cacheComponents: true,
  partialPrefetching: true,
  // Без постоянного кэша сборки: Vercel восстанавливает .next/cache от прошлого деплоя, и в боевую сборку попал устаревший CSS
  // (старый светлый шаблон вместо нашей темы, docs/findings/2026-10-27-stale-css-vercel-cache.md). Сборка занимает ≈30 секунд.
  experimental: { turbopackFileSystemCacheForBuild: false },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
