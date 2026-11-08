const test = require("node:test");
const assert = require("node:assert/strict");
const { parseQuantity, makeGroceryList } = require("../utils/groceryList");

test("parses whole numbers, decimal values, fractions and mixed amounts safely", () => {
  assert.equal(parseQuantity("2"), 2);
  assert.equal(parseQuantity("0.75"), 0.75);
  assert.equal(parseQuantity("1/2"), 0.5);
  assert.equal(parseQuantity("1 1/2"), 1.5);
  assert.equal(parseQuantity("to taste"), null);
  assert.equal(parseQuantity("1-2"), null);
});

test("scales quantities according to planned servings and combines matching names", () => {
  const entries = [
    { servingsPlanned: 2, recipe: { status: "published", servings: 4, ingredients: [
      { name: "Rice", quantity: "2", unit: "cup" },
      { name: "Salt", quantity: "to taste", unit: "" }
    ] } },
    { recipe: { status: "published", servings: 2, ingredients: [
      { name: "rice", quantity: "1", unit: "cup" },
      { name: "Rice", quantity: "1", unit: "kg" }
    ] } },
    { recipe: { status: "draft", servings: 1, ingredients: [{ name: "Egg", quantity: "12", unit: "" }] } }
  ];
  const items = makeGroceryList(entries);
  assert.equal(items.length, 3);
  assert.equal(items.find((item) => item.name.toLowerCase() === "rice" && item.unit === "cup").amount, "2 cup");
  assert.equal(items.find((item) => item.unit === "kg").amount, "1 kg");
  assert.equal(items.find((item) => item.name === "Salt").amount, "to taste");
});

test("merges case-insensitive compatible volume units and retains mass separate", () => {
  const entries = [
    { recipe: { status: "published", servings: 1, ingredients: [
      { name: "oil", quantity: "2", unit: "cups" },
      { name: "Salt", quantity: "1", unit: "tsp" }
    ] } },
    { recipe: { status: "published", servings: 1, ingredients: [
      { name: "Oil", quantity: "1", unit: "tsp" },
      { name: "Salt", quantity: "2", unit: "g" }
    ] } }
  ];
  const items = makeGroceryList(entries);
  assert.equal(items.length, 3);
  assert.equal(items.find((i) => i.name === "Oil").amount, "485 ml");
  assert.equal(items.find((i) => i.name === "Oil").category, "Pantry");
  assert.equal(items.find((i) => i.name === "Salt" && i.unit === "tsp").amount, "1 tsp");
  assert.equal(items.find((i) => i.name === "Salt" && i.unit === "g").amount, "2 g");
});

test("older meal plans without servingsPlanned use the recipe serving count", () => {
  const items = makeGroceryList([{ recipe: { status: "published", servings: 4, ingredients: [{ name: "Eggs", quantity: "4", unit: "" }] } }]);
  assert.equal(items[0].amount, "4");
  assert.equal(items[0].category, "Dairy & Eggs");
});
