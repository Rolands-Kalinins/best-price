import assert from "node:assert/strict";
import { test } from "node:test";
import { rigaIso } from "./riga";

test("rigaIso: летнее и зимнее время, переход 25.10.2026", () => {
  assert.equal(rigaIso(2026, 10, 19, 0, 0, 0), "2026-10-18T21:00:00.000Z"); // EEST, UTC+3
  assert.equal(rigaIso(2026, 10, 26, 23, 59, 59), "2026-10-26T21:59:59.000Z"); // EET, UTC+2
});
