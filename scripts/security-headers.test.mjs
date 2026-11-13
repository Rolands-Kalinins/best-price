import assert from "node:assert/strict";
import { test } from "node:test";
import { securityHeaders } from "../apps/web/security-headers.ts";

const get = (list, key) => list.find((h) => h.key === key)?.value;

test("заголовки: запрет встраивания, nosniff, referrer, HSTS", () => {
  const h = securityHeaders({ supabaseUrl: "https://x.supabase.co", dev: false });
  assert.equal(get(h, "X-Content-Type-Options"), "nosniff");
  assert.equal(get(h, "Referrer-Policy"), "strict-origin-when-cross-origin");
  assert.match(get(h, "Strict-Transport-Security"), /max-age=\d+/);
  assert.match(get(h, "Content-Security-Policy"), /frame-ancestors 'none'/);
});

test("CSP: свой источник, Supabase в connect-src, картинки магазинов по https", () => {
  const csp = get(securityHeaders({ supabaseUrl: "https://x.supabase.co", dev: false }), "Content-Security-Policy");
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /connect-src 'self' https:\/\/x\.supabase\.co/);
  assert.match(csp, /img-src 'self' data: blob: https:/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'self'/);
  assert.doesNotMatch(csp, /unsafe-eval/, "unsafe-eval только в dev");
});

test("CSP в dev: unsafe-eval и websocket для HMR; в боевом нет HSTS-ловушки для localhost", () => {
  const h = securityHeaders({ supabaseUrl: "http://127.0.0.1:54321", dev: true });
  assert.match(get(h, "Content-Security-Policy"), /unsafe-eval/);
  assert.match(get(h, "Content-Security-Policy"), /ws:/);
  assert.equal(get(h, "Strict-Transport-Security"), undefined);
});

test("CSP: без адреса Supabase не ломается и не пропускает мусор", () => {
  const csp = get(securityHeaders({ supabaseUrl: undefined, dev: false }), "Content-Security-Policy");
  assert.match(csp, /connect-src 'self'(;|$)/);
  const evil = get(securityHeaders({ supabaseUrl: "https://a.com; script-src *", dev: false }), "Content-Security-Policy");
  assert.doesNotMatch(evil, /script-src \*/, "значение из окружения не должно дописывать директивы");
});
