const test = require("node:test");
const assert = require("node:assert/strict");
const {
  matchesDiet, desiredSlots, suggestedMeals, buildPrompt, askGeminiForPlan
} = require("../services/mealPlanAiService");
const { validateBatch, validatePreferences, escapeRegExp } = require("../utils/mealPlanAiValidation");

const id = (number) => number.toString(16).padStart(24, "0");
const recipes = [
  { _id: id(1), title: "Oatmeal", category: "breakfast", ingredients: [{ name: "Oats" }, { name: "Plant milk" }] },
  { _id: id(2), title: "Chicken Karahi", category: "dinner", ingredients: [{ name: "Chicken" }, { name: "oil" }] },
  { _id: id(3), title: "Tofu Curry", category: "dinner", ingredients: [{ name: "Tofu" }, { name: "tomato" }] }
];

test("dietary prefilters conservatively exclude animal products", () => {
  assert.equal(matchesDiet(recipes[1], "vegetarian"), false);
  assert.equal(matchesDiet(recipes[1], "vegan"), false);
  assert.equal(matchesDiet(recipes[2], "vegan"), true);
  assert.equal(matchesDiet({ title: "Cheese Sandwich", ingredients: [] }, "vegan"), false);
  assert.equal(matchesDiet(recipes[1], "any"), true);
});

test("only empty slots are targeted unless explicitly replacing", () => {
  const existing = [{ day: 0, mealType: "breakfast" }, { day: 6, mealType: "dinner" }];
  assert.equal(desiredSlots(existing, false).length, 19);
  assert.equal(desiredSlots(existing, true).length, 21);
  assert.equal(desiredSlots(existing, false).some((slot) => slot.day === 0 && slot.mealType === "breakfast"), false);
});

test("AI suggestions only use published candidate IDs and fill missing slots visibly", () => {
  const slots = [{ day: 0, mealType: "breakfast" }, { day: 0, mealType: "lunch" }, { day: 0, mealType: "dinner" }];
  const output = { slots: [
    { day: 0, mealType: "breakfast", recipeId: id(1), reason: "Fits breakfast" },
    { day: 0, mealType: "lunch", recipeId: id(99) },
    { day: 77, mealType: "lunch", recipeId: id(2) }
  ] };
  const suggestions = suggestedMeals(output, slots, recipes);
  assert.equal(suggestions.length, 3);
  assert.equal(suggestions[0].recipe._id, id(1));
  assert.equal(suggestions[1].source, "fallback");
  assert.equal(suggestions[2].source, "fallback");
  assert.ok(suggestions.every((entry) => recipes.includes(entry.recipe)));
  assert.throws(() => suggestedMeals({ slots: [{ day: 0, mealType: "breakfast", recipeId: id(99) }] }, slots, recipes));
});

test("model prompt includes only catalog candidates with requested slots", () => {
  const prompt = buildPrompt({ candidates: recipes, targets: [{ day: 1, mealType: "lunch" }], existing: [],
    goal: "variety", diet: "any", maxMinutes: "any", notes: "No repeats" });
  assert.match(prompt, /No repeats/);
  assert.match(prompt, /recipeId/);
  assert.match(prompt, /Tofu Curry/);
});

test("malformed or duplicate apply batches are rejected", () => {
  const valid = [{ day: 0, mealType: "breakfast", recipeId: id(1) }];
  assert.equal(validateBatch(valid), true);
  assert.equal(validateBatch([...valid, ...valid]), false);
  assert.equal(validateBatch([{ day: 7, mealType: "lunch", recipeId: id(2) }]), false);
  assert.equal(validateBatch([{ day: 1, mealType: "snack", recipeId: id(2) }]), false);
  assert.equal(validateBatch([{ day: 1, mealType: "lunch", recipeId: "made-up" }]), false);
  assert.equal(validatePreferences({ goal: "balanced", diet: "any", maxMinutes: 45, notes: "Hi", overwriteExisting: true }).goal, "balanced");
  assert.equal(validatePreferences({ diet: "unknown" }), null);
});

test("recipe query escapes literal regex metacharacters", () => {
  assert.equal(new RegExp(escapeRegExp("rice [spicy]"), "i").test("rice [spicy]"), true);
  assert.equal(new RegExp(escapeRegExp("rice [spicy]"), "i").test("rice s"), false);
});

test("Gemini request uses an API key header and parses structured JSON", async () => {
  const output = { slots: [{ day: 0, mealType: "dinner", recipeId: id(3) }] };
  const result = await askGeminiForPlan("prompt", { apiKey: "test-api-key", model: "gemini-3.1-flash-lite",
    fetchImpl: async (url, options) => {
      assert.match(url, /gemini-3\.1-flash-lite:generateContent/);
      assert.equal(options.headers["x-goog-api-key"], "test-api-key");
      const body = JSON.parse(options.body);
      assert.equal(body.generationConfig.responseFormat.text.mimeType, "APPLICATION_JSON");
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(output) }] } }] }) };
    }
  });
  assert.deepEqual(result, output);
});

test("Gemini errors cannot leak API responses or credentials", async () => {
  await assert.rejects(askGeminiForPlan("prompt", { apiKey: "secret-value", fetchImpl: async () => ({ ok: false, status: 400 }) }),
    /Gemini could not generate/);
});
