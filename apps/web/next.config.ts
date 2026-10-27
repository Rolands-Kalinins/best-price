import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
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
