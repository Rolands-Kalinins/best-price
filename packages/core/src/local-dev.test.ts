import assert from "node:assert/strict";
import { test } from "node:test";
import { canPullProdData } from "./local-dev";

test("canPullProdData: только dev-сервер с локальной БД", () => {
  assert.equal(canPullProdData("development", "http://127.0.0.1:54321"), true);
  assert.equal(canPullProdData("development", "http://localhost:54321"), true);
});

test("canPullProdData: Vercel (production), боевая БД и пустой адрес запрещены", () => {
  assert.equal(canPullProdData("production", "http://127.0.0.1:54321"), false);
  assert.equal(canPullProdData("development", "https://abc.supabase.co"), false);
  assert.equal(canPullProdData("development", undefined), false);
  assert.equal(canPullProdData(undefined, "http://127.0.0.1:54321"), false);
});

test("canPullProdData: хитрый адрес, где localhost лишь часть имени, не проходит", () => {
  assert.equal(canPullProdData("development", "https://localhost.evil.com"), false);
  assert.equal(canPullProdData("development", "https://evil.com/?u=http://127.0.0.1"), false);
});
