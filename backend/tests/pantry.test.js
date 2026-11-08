const test = require("node:test");
const assert = require("node:assert/strict");
const { makeGroceryList } = require("../utils/groceryList");
const {
  normalizeName, pantryKey, validatePantryInput, normalizePantryInput,
  applyPantryToGroceryList, compareRecipeToPantry
} = require("../utils/pantry");

function plan(ingredients, servings = 2, servingsPlanned = 2) {
  return [{ servingsPlanned, recipe: { status: "published", servings, ingredients } }];
}
function stock(name, quantity, unit = "") { return { name, quantity, unit }; }

test("normalizes common plurals but not unrelated ingredient names", () => {
  assert.equal(normalizeName("   Onions "), "onion");
  assert.equal(normalizeName("Tomatoes"), "tomato");
  assert.equal(normalizeName("eggs"), "egg");
  assert.notEqual(normalizeName("olive oil"), normalizeName("oil"));
  assert.equal(pantryKey("Eggs", "piece"), pantryKey("egg", ""));
});

test("rejects invalid quantities, names and unit strings", () => {
  assert.match(validatePantryInput({ name: "", quantity: 2 }), /name/i);
  assert.match(validatePantryInput({ name: "Rice", quantity: "2" }), /quantity/i);
  assert.match(validatePantryInput({ name: "Rice", quantity: -1 }), /quantity/i);
  assert.match(validatePantryInput({ name: "Rice", quantity: 0.00001 }), /quantity/i);
  assert.match(validatePantryInput({ name: "Rice", quantity: 2, unit: "cup; DROP" }), /unit/i);
  assert.equal(validatePantryInput({ name: "Rice", quantity: 2, unit: "cup" }), null);
  assert.deepEqual(normalizePantryInput({ name: " Onions ", quantity: 2, unit: "piece" }), {
    name: "Onions", normalizedName: "onion", quantity: 2, unit: "piece", family: "count", category: "Produce"
  });
});

test("subtracts compatible units and scales recipes before deduction", () => {
  const groceries = makeGroceryList(plan([{ name: "Chicken", quantity: "2", unit: "kg" }], 4, 2));
  const adjusted = applyPantryToGroceryList(groceries, [stock("chicken", 500, "g")]);
  assert.equal(groceries[0].amount, "1 kg");
  assert.equal(adjusted.items[0].amount, "0.5 kg");
  assert.equal(adjusted.partiallyCovered, 1);
});

test("does not merge incompatible mass and volume units", () => {
  const groceries = makeGroceryList(plan([{ name: "Rice", quantity: "1", unit: "cup" }]));
  const result = applyPantryToGroceryList(groceries, [stock("rice", 2, "kg")]);
  assert.equal(result.items[0].amount, "1 cup");
  assert.equal(result.covered, 0);
});

test("fully covers ingredients and recognizes unitless vs pieces", () => {
  const groceries = makeGroceryList(plan([{ name: "Eggs", quantity: "2", unit: "" }]));
  const result = applyPantryToGroceryList(groceries, [stock("egg", 3, "piece")]);
  assert.equal(result.items.length, 0);
  assert.equal(result.covered, 1);
});

test("does not silently drop to-taste or unknown quantities", () => {
  const groceries = makeGroceryList(plan([{ name: "Salt", quantity: "to taste", unit: "" }, { name: "Salt", quantity: "2", unit: "" }]));
  const result = applyPantryToGroceryList(groceries, [stock("salt", 10, "")]);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].amount, "to taste");
  assert.equal(result.partiallyCovered, 1);
});

test("pantry stock is not reused twice for separate grocery lines of similar ingredient names", () => {
  const groceries = makeGroceryList(plan([{ name: "Onions", quantity: "3", unit: "piece" }, { name: "Onion", quantity: "3", unit: "piece" }]));
  const result = applyPantryToGroceryList(groceries, [stock("onion", 4, "piece")]);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].amount, "2 piece");
});

test("recipe matching reports ready, shortfall and ambiguous units", () => {
  const recipe = { ingredients: [
    { name: "eggs", quantity: "2", unit: "" },
    { name: "flour", quantity: "200", unit: "g" }
  ] };
  assert.equal(compareRecipeToPantry(recipe, [stock("Egg", 3, "piece"), stock("Flour", 300, "g")]).status, "ready");
  const short = compareRecipeToPantry(recipe, [stock("egg", 3, "piece"), stock("flour", 150, "g")]);
  assert.equal(short.status, "missing");
  assert.equal(short.missing[0].amount, "50 g");
  const unknown = compareRecipeToPantry(recipe, [stock("egg", 3, "piece"), stock("flour", 1, "cup")]);
  assert.equal(unknown.status, "review");
  assert.equal(unknown.uncertain.length, 1);
});

test("a repeated recipe ingredient uses remaining pantry stock once", () => {
  const result = compareRecipeToPantry({ ingredients: [
    { name: "egg", quantity: "3", unit: "piece" }, { name: "eggs", quantity: "3", unit: "piece" }
  ] }, [stock("egg", 4, "piece")]);
  assert.equal(result.status, "missing");
  assert.equal(result.matchedCount, 1);
  assert.equal(result.missing[0].amount, "2 piece");
});

test("unquantified ingredient absent from pantry is missing, not ready", () => {
  const result = compareRecipeToPantry({ ingredients: [
    { name: "saffron", quantity: "to taste", unit: "" }
  ] }, []);
  assert.equal(result.status, "missing");
  assert.equal(result.missing[0].amount, "Amount not specified");
});
