import assert from "node:assert/strict";
import { test } from "node:test";
import { isPublicPath } from "./public-path";

test("isPublicPath: вход, auth и политика открыты без входа", () => {
  for (const p of ["/login", "/auth/callback", "/privacy"]) assert.equal(isPublicPath(p), true, p);
});

test("isPublicPath: остальное и похожие префиксы закрыты", () => {
  for (const p of ["/", "/grocery", "/pharmacy/1", "/privacy/x", "/privacyx", "/login/x", "/authx", "/admin"]) assert.equal(isPublicPath(p), false, p);
});
