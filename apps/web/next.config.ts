import type { NextConfig } from "next";
import { securityHeaders } from "./security-headers";

const nextConfig: NextConfig = {
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
