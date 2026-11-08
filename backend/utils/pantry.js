const { unitInfo, parseQuantity, categoryFor } = require("./groceryList");

// Deliberately conservative: don't equate olive oil with generic oil or
// silently convert cups of flour into grams (density is ingredient-specific).
function normalizeName(value) {
  const name = String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return name.split(" ").map((word) => {
    if (/^[a-z]+$/.test(word)) {
      if (/ies$/.test(word) && word.length > 4) return `${word.slice(0, -3)}y`;
      if (/(tomatoes|potatoes)$/.test(word)) return word.slice(0, -2);
      if (/s$/.test(word) && !/(ss|us|is)$/.test(word) && word.length > 3) return word.slice(0, -1);
    }
    return word;
  }).join(" ");
}

function familyFor(unit) {
  const family = unitInfo(unit).family;
  return family === "unitless" ? "count" : family;
}

function pantryKey(name, unit) { return `${normalizeName(name)}\u0000${familyFor(unit)}`; }

function validatePantryInput(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "Provide a pantry ingredient.";
  const { name, quantity, unit = "" } = value;
  if (typeof name !== "string" || !name.trim() || name.trim().length > 100) return "Ingredient name must be 1–100 characters.";
  if (typeof unit !== "string" || unit.length > 24 || (unit && !/^[a-zA-Z][a-zA-Z -]*$/.test(unit))) return "Use a valid unit (up to 24 letters).";
  if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity < 0.001 || quantity > 1000000) return "Quantity must be at least 0.001 and no more than 1,000,000.";
  if (normalizeName(name).length > 100) return "Ingredient name is too long.";
  return null;
}

function normalizePantryInput(value) {
  const name = value.name.trim().replace(/\s+/g, " ");
  const unit = value.unit?.trim().toLowerCase() || "";
  return { name, normalizedName: normalizeName(name), quantity: value.quantity, unit, family: familyFor(unit), category: categoryFor(name) };
}

function stockByKey(items) {
  const stock = new Map();
  for (const item of items) {
    const quantity = Number(item.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    const { factor } = unitInfo(item.unit);
    const key = pantryKey(item.name, item.unit);
    stock.set(key, (stock.get(key) || 0) + quantity * factor);
  }
  return stock;
}

function rounded(n) { return Number(n.toFixed(3)); }
function formatAmount(base, unit) {
  const factor = unitInfo(unit).factor;
  return `${rounded(base / factor)}${unit ? ` ${unit}` : ""}`;
}

function applyPantryToGroceryList(groceries, pantryItems) {
  const stock = stockByKey(pantryItems);
  const items = [];
  let covered = 0;
  let partiallyCovered = 0;
  for (const original of groceries) {
    const item = { ...original };
    const base = Number(original.numericBase) || 0;
    const other = Array.isArray(original.otherAmounts) ? original.otherAmounts : [];
    const key = pantryKey(original.name, original.unit);
    const available = Math.max(0, stock.get(key) || 0);
    const deducted = Math.min(base, available);
    if (deducted > 0) stock.set(key, Math.max(0, available - deducted));
    const remaining = Math.max(0, base - deducted);
    // A quantity such as 'to taste' is never silently erased by pantry stock.
    if (deducted > 0 && remaining < 0.000001 && !other.length) {
      covered++;
      continue;
    }
    if (deducted > 0) partiallyCovered++;
    if (deducted > 0) {
      item.amount = [remaining >= 0.000001 ? formatAmount(remaining, original.unit) : "", ...other]
        .filter(Boolean).join(" + ") || "Amount not specified";
      item.pantryUsed = formatAmount(deducted, original.unit);
    }
    items.push(item);
  }
  return { items, covered, partiallyCovered };
}

function compareRecipeToPantry(recipe, pantryItems) {
  const stock = stockByKey(pantryItems);
  const presentNames = new Set(pantryItems.map((item) => normalizeName(item.name)));
  const missing = [];
  const uncertain = [];
  let matchedCount = 0;
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  for (const ingredient of ingredients) {
    const name = String(ingredient.name || "").trim();
    if (!name) continue;
    const key = pantryKey(name, ingredient.unit);
    const available = stock.get(key) || 0;
    const numeric = parseQuantity(ingredient.quantity);
    const needed = numeric === null ? null : numeric * unitInfo(ingredient.unit).factor;
    if (needed === null || needed <= 0) {
      if (!presentNames.has(normalizeName(name))) missing.push({ name, amount: "Amount not specified" });
      else uncertain.push({ name, reason: "Recipe quantity needs review" });
    } else if (available + 0.000001 >= needed) {
      matchedCount++;
      stock.set(key, Math.max(0, available - needed));
    } else if (presentNames.has(normalizeName(name)) && !stock.has(key)) {
      uncertain.push({ name, reason: "Pantry uses an incompatible unit" });
    } else {
      if (available > 0) stock.set(key, 0);
      missing.push({ name, amount: formatAmount(Math.max(0, needed - available), ingredient.unit) });
    }
  }
  return {
    status: missing.length ? "missing" : uncertain.length ? "review" : "ready",
    matchedCount, ingredientCount: ingredients.filter((item) => String(item.name || "").trim()).length,
    missing, uncertain
  };
}

module.exports = {
  normalizeName, familyFor, pantryKey, validatePantryInput, normalizePantryInput,
  stockByKey, applyPantryToGroceryList, compareRecipeToPantry
};
