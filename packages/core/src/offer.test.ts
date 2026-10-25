import assert from "node:assert/strict";
import { test } from "node:test";
import { unitPrice } from "./offer";

test("unitPrice", () => {
  assert.deepEqual(unitPrice(2.89, "150 g"), { unitPrice: 19.27, unit: "kg" });
  assert.deepEqual(unitPrice(3.49, "1 l"), { unitPrice: 3.49, unit: "l" });
  assert.deepEqual(unitPrice(16.99, "8 x 125 g"), { unitPrice: 16.99, unit: "kg" });
  assert.deepEqual(unitPrice(5.79, "gab. 250 g"), { unitPrice: 23.16, unit: "kg" });
  assert.deepEqual(unitPrice(1, "500 ml"), { unitPrice: 2, unit: "l" });
  assert.equal(unitPrice(1.59, "10 gab."), null);
  assert.equal(unitPrice(1.49, null), null);
});
