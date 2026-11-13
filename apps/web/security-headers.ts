// Заголовки безопасности для всех страниц (next.config.ts). Файл без TS-only синтаксиса: его запускает и `node --test` (scripts/security-headers.test.mjs).
// ponytail: script-src с 'unsafe-inline', потому что nonce заставил бы рисовать каждую страницу на сервере заново; ужесточить, если появится пользовательский HTML.
export function securityHeaders({ supabaseUrl, dev }: { supabaseUrl: string | undefined; dev: boolean }) {
  // Из адреса берём только origin: значение из окружения не должно дописывать свои директивы.
  let supabase = "";
  try {
    if (supabaseUrl) supabase = new URL(supabaseUrl).origin;
  } catch {}

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    // Картинки товаров грузятся прямо с сайтов магазинов (список их доменов меняется), поэтому любой https.
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self'${supabase ? ` ${supabase}` : ""}${dev ? " ws:" : ""}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");

  return [
    { key: "Content-Security-Policy", value: csp },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    // HSTS на localhost запомнился бы браузером и сломал бы http-разработку других проектов.
    ...(dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
  ];
}
