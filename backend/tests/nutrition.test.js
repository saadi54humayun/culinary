const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const {
  amountInGrams, nutritionFingerprint, nutritionForWeek
} = require("../utils/nutrition");

// The live service uses Mongoose; mock only its model so pure calculation and
// USDA response decoding can be verified without a database or network.
const oldLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === "../models/Recipe" && parent?.filename.endsWith("nutritionService.js")) return {};
  return oldLoad.call(this, request, parent, isMain);
};
const { per100Grams, matchScore, calculateRecipeNutrition } = require("../services/nutritionService");
Module._load = oldLoad;

const nutrients = (values) => Object.entries(values).map(([nutrientId, value]) => ({
  nutrientId: Number(nutrientId), value, unitName: nutrientId === "2047" || nutrientId === "1008" ? "KCAL" : "G"
}));

test("quantity conversions never assume generic flour-like density", () => {
  assert.deepEqual(amountInGrams({ name: "chicken", quantity: "1 1/2", unit: "kg" }), { grams: 1500, approximate: false });
  assert.deepEqual(amountInGrams({ name: "eggs", quantity: "2", unit: "" }), { grams: 100, approximate: true });
  assert.deepEqual(amountInGrams({ name: "oil", quantity: "1", unit: "cup" }), { grams: 220.8, approximate: true });
  assert.match(amountInGrams({ name: "mushrooms", quantity: "1", unit: "cup" }).reason, /No safe grams/);
  assert.match(amountInGrams({ name: "chicken", quantity: "to taste", unit: "kg" }).reason, /Quantity/);
});

test("food nutrients handle USDA Foundation 2047 energy and full-detail shapes", () => {
  const foodSearch = { foodNutrients: nutrients({ 2047: 89, 1003: 1, 1004: 0.3, 1005: 23, 1079: 2.6 }) };
  assert.deepEqual(per100Grams(foodSearch), { calories: 89, protein: 1, fat: 0.3, carbs: 23, fiber: 2.6 });
  const detail = { foodNutrients: [
    { nutrient: { id: 1008, unitName: "kcal" }, amount: 165 },
    { nutrient: { id: 1003, unitName: "g" }, amount: 31 },
    { nutrient: { id: 1004, unitName: "g" }, amount: 3.6 },
    { nutrient: { id: 1005, unitName: "g" }, amount: 0 }
  ] };
  assert.equal(per100Grams(detail).calories, 165);
  assert.ok(matchScore({ description: "Tomatoes, raw", dataType: "Foundation" }, "tomato") >= 0);
  assert.equal(matchScore({ description: "Potatoes, raw" }, "chicken"), -1);
});

test("calculates an estimated recipe from a fake USDA response and flags unmeasurable ingredients", async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.USDA_API;
  process.env.USDA_API = "test-key-not-real";
  global.fetch = async (_url, options) => {
    const { query } = JSON.parse(options.body);
    return { ok: true, json: async () => ({ foods: [{
      fdcId: 1, description: `${query}, raw`, dataType: "Foundation",
      foodNutrients: nutrients({ 2047: 100, 1003: 20, 1004: 1, 1005: 4, 1079: 1 })
    }] }) };
  };
  try {
    const recipe = {
      servings: 2, ingredients: [
        { name: "chicken", quantity: "200", unit: "g" },
        { name: "unusual ingredient", quantity: "1", unit: "cup" }
      ]
    };
    const result = await calculateRecipeNutrition(recipe);
    assert.equal(result.status, "partial");
    assert.equal(result.matchedCount, 1);
    assert.equal(result.total.calories, 200);
    assert.equal(result.perServing.calories, 100);
    assert.equal(result.missingIngredients.length, 1);
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.USDA_API;
    else process.env.USDA_API = originalKey;
  }
});

test("the planner multiplies servings and reports incomplete totals transparently", () => {
  const recipe = {
    _id: "aaaaaaaaaaaaaaaaaaaaaaaa", title: "Test recipe", status: "published", servings: 4,
    ingredients: [{ name: "chicken", quantity: "400", unit: "g" }]
  };
  const fingerprint = nutritionFingerprint(recipe);
  recipe.nutrition = {
    status: "ready", fingerprint,
    perServing: { calories: 200, protein: 30, carbs: 5, fat: 4, fiber: 0 }
  };
  const result = nutritionForWeek([
    { recipe, day: 0, mealType: "breakfast", servingsPlanned: 2 },
    { recipe, day: 0, mealType: "dinner", servingsPlanned: 3 },
    { recipe: { ...recipe, nutrition: undefined }, day: 1, mealType: "lunch", servingsPlanned: 2 }
  ]);
  assert.equal(result.totals.calories, 1000);
  assert.equal(result.days[0].totals.protein, 150);
  assert.equal(result.incompleteMeals, 1);
  assert.equal(result.complete, false);
  assert.deepEqual(result.uncalculatedRecipeIds, [recipe._id]);
});

test("fingerprint changes when the ingredients or recipe servings change", () => {
  const one = { servings: 2, ingredients: [{ name: "Oil", quantity: "2", unit: "tbsp" }] };
  const two = { ...one, ingredients: [{ name: "Oil", quantity: "3", unit: "tbsp" }] };
  assert.notEqual(nutritionFingerprint(one), nutritionFingerprint(two));
  assert.notEqual(nutritionFingerprint(one), nutritionFingerprint({ ...one, servings: 3 }));
});
