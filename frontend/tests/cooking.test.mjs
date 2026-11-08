import test from "node:test";
import assert from "node:assert/strict";
import { parseIngredientQuantity, scaledIngredient, suggestedStepSeconds, secondsRemaining, formatClock } from "../src/utils/cooking.js";

test("scales whole and fractional ingredients by planned servings", () => {
  assert.equal(parseIngredientQuantity("1 1/2"), 1.5);
  assert.equal(scaledIngredient({ name: "Rice", quantity: "1 1/2", unit: "cup" }, 4, 2).text, "0.75 cup Rice");
  assert.deepEqual(scaledIngredient({ name: "Salt", quantity: "to taste" }, 4, 2), { text: "to taste Salt", approximate: true });
});

test("parses step duration and formats remaining time", () => {
  assert.equal(suggestedStepSeconds("Simmer for 10-15 minutes"), 600);
  assert.equal(suggestedStepSeconds("Wait 30 seconds"), 30);
  assert.equal(suggestedStepSeconds("No timer here"), 300);
  assert.equal(formatClock(3661), "1:01:01");
});

test("uses wall clock time to resume a running timer", () => {
  const now = Date.UTC(2026, 0, 1);
  assert.equal(secondsRemaining({ running: true, endsAt: new Date(now + 100000).toISOString() }, now + 40000), 60);
  assert.equal(secondsRemaining({ running: true, endsAt: new Date(now + 100000).toISOString() }, now + 200000), 0);
});
