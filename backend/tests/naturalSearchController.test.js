const test = require("node:test");
const assert = require("node:assert/strict");
const { validateIntent, ingredientFilter } = require("../controllers/naturalSearchController");

const validIntent = {
  terms: ["omelette"],
  requiredIngredients: ["egg"],
  excludedIngredients: ["flour"],
  category: "breakfast",
  maxTotalMinutes: 20,
  excludedEquipment: ["oven"],
  clarificationNeeded: false,
  clarificationQuestion: "",
  assumptions: []
};

test("accepts only the allowlisted natural-search intent shape", () => {
  assert.deepEqual(validateIntent(validIntent), validIntent);
  assert.equal(validateIntent({ ...validIntent, category: "$where" }), null);
  assert.equal(validateIntent({ ...validIntent, requiredIngredients: ["egg", { $ne: "eggplant" }] }), null);
  assert.equal(validateIntent({ ...validIntent, maxTotalMinutes: 0 }), null);
});

test("ingredient patterns use token boundaries", () => {
  const egg = new RegExp(ingredientFilter("egg")["ingredients.name"].$regex, "i");
  const flour = new RegExp(ingredientFilter("flour")["ingredients.name"].$regex, "i");
  assert.equal(egg.test("eggs"), true);
  assert.equal(egg.test("eggplant"), false);
  assert.equal(flour.test("flour"), true);
  assert.equal(flour.test("almond flour"), false);
});
