const test = require("node:test");
const assert = require("node:assert/strict");
const { freshProgress, normalizeTimer, validateCookingProgress, recipeVersion } = require("../utils/cookingProgress");

const recipe = { servings: 4, steps: ["Boil", "Simmer", "Serve"], ingredients: [{ name: "Rice" }, { name: "Water" }] };
const base = () => freshProgress(recipe);

test("creates per-recipe default progress", () => {
  assert.deepEqual(base(), { stepIndex: 0, checkedIngredients: [], servings: 4, completed: false,
    timer: { stepIndex: null, remainingSeconds: 0, running: false, endsAt: null } });
});

test("validates progress and deduplicates ingredient checklist", () => {
  const progress = validateCookingProgress({ ...base(), stepIndex: 2, checkedIngredients: [1, 0, 1], servings: 2, completed: true }, recipe);
  assert.deepEqual(progress.checkedIngredients, [0, 1]);
  assert.equal(progress.servings, 2);
  assert.equal(progress.completed, true);
});

test("rejects invalid step, serving count, checklist and timer", () => {
  for (const patch of [
    { stepIndex: 3 }, { servings: -2 }, { servings: 1.5 }, { checkedIngredients: [9] },
    { timer: { stepIndex: 1, running: true, remainingSeconds: 100, endsAt: "bad" } },
    { timer: { stepIndex: 1, running: true, remainingSeconds: 100, endsAt: new Date(Date.now() + 8 * 3600 * 1000).toISOString() } },
    { timer: { stepIndex: 0, running: false, remainingSeconds: 15, endsAt: new Date().toISOString() } }
  ]) {
    assert.throws(() => validateCookingProgress({ ...base(), ...patch }, recipe));
  }
});

test("running timer resumes by wall-clock deadline, including across closed tabs", () => {
  const now = Date.UTC(2026, 0, 1);
  const timer = { stepIndex: 0, running: true, remainingSeconds: 90, endsAt: new Date(now + 90000).toISOString() };
  assert.equal(normalizeTimer(timer, now + 10000).remainingSeconds, 80);
  assert.equal(normalizeTimer(timer, now + 92000).running, false);
  assert.equal(normalizeTimer(timer, now + 92000).remainingSeconds, 0);
});

test("recipe version follows ingredients and steps, not unrelated nutrition changes", () => {
  const initial = recipeVersion(recipe);
  assert.equal(recipeVersion({ ...recipe, nutrition: { status: "ready" }, description: "New" }), initial);
  assert.notEqual(recipeVersion({ ...recipe, steps: ["Bake"] }), initial);
  assert.notEqual(recipeVersion({ ...recipe, servings: 6 }), initial);
});
