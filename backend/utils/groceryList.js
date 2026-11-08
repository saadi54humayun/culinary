// Ingredient quantities are written by users. Only convert known compatible
// mass / volume units; never assume a density (cups of flour != grams of flour).
const UNITS = {
  g: ["mass", 1, "g"], gram: ["mass", 1, "g"], grams: ["mass", 1, "g"],
  kg: ["mass", 1000, "kg"], kilogram: ["mass", 1000, "kg"], kilograms: ["mass", 1000, "kg"],
  mg: ["mass", 0.001, "mg"],
  ml: ["volume", 1, "ml"], milliliter: ["volume", 1, "ml"], milliliters: ["volume", 1, "ml"],
  millilitre: ["volume", 1, "ml"], millilitres: ["volume", 1, "ml"],
  l: ["volume", 1000, "l"], liter: ["volume", 1000, "l"], litres: ["volume", 1000, "l"],
  litre: ["volume", 1000, "l"], liters: ["volume", 1000, "l"],
  tsp: ["volume", 5, "tsp"], teaspoon: ["volume", 5, "tsp"], teaspoons: ["volume", 5, "tsp"],
  tbsp: ["volume", 15, "tbsp"], tablespoon: ["volume", 15, "tbsp"], tablespoons: ["volume", 15, "tbsp"],
  cup: ["volume", 240, "cup"], cups: ["volume", 240, "cup"],
  piece: ["count", 1, "piece"], pieces: ["count", 1, "piece"], pcs: ["count", 1, "piece"], pc: ["count", 1, "piece"]
};

const CATEGORIES = ["Produce", "Meat & Seafood", "Dairy & Eggs", "Grains & Bakery", "Herbs & Spices", "Pantry", "Other"];

function parseQuantity(value) {
  const input = String(value ?? "").trim();
  if (!input) return null;
  const fraction = (part) => {
    const [numerator, denominator, ...extra] = part.split("/");
    if (extra.length || !/^\d+$/.test(numerator) || !/^\d+$/.test(denominator) || Number(denominator) === 0) return null;
    return Number(numerator) / Number(denominator);
  };
  if (/^\d+(?:\.\d+)?$/.test(input)) return Number(input);
  if (/^\d+\/\d+$/.test(input)) return fraction(input);
  if (/^\d+\s+\d+\/\d+$/.test(input)) {
    const [whole, part] = input.split(/\s+/);
    return Number(whole) + fraction(part);
  }
  return null;
}

function unitInfo(unit) {
  const normalized = String(unit ?? "").trim().toLowerCase().replace(/\.$/, "");
  const match = UNITS[normalized];
  if (match) return { family: match[0], factor: match[1], label: match[2] };
  return { family: normalized ? `other:${normalized}` : "unitless", factor: 1, label: normalized };
}

function categoryFor(name) {
  if (/\b(chicken|beef|lamb|mutton|pork|turkey|fish|salmon|tuna|shrimp|prawns?|meat|seafood)\b/i.test(name)) return "Meat & Seafood";
  if (/\b(eggs?|milk|yogurt|yoghurt|butter|cheese|cream|paneer)\b/i.test(name)) return "Dairy & Eggs";
  if (/\b(onions?|tomato(?:es)?|potato(?:es)?|garlic|ginger|carrots?|peppers?|chill?ies?|spinach|broccoli|lettuce|cucumber|mushrooms?|lemon|lime|apple|banana|mango|fruit|berries|cilantro|coriander leaves|parsley|cabbage)\b/i.test(name)) return "Produce";
  if (/\b(bread|flour|rice|pasta|noodles|oats|tortilla|buns?|pita|breadcrumbs)\b/i.test(name)) return "Grains & Bakery";
  if (/\b(salt|pepper|cumin|turmeric|paprika|cinnamon|oregano|basil|cardamom|cloves?|masala|coriander powder|chilli powder|red pepper flakes|herbs?|spices?)\b/i.test(name)) return "Herbs & Spices";
  if (/\b(oil|vinegar|sugar|honey|beans?|lentils?|chickpeas?|sauce|stock|broth|syrup|baking powder)\b/i.test(name)) return "Pantry";
  return "Other";
}

function round(value) { return Number(value.toFixed(3)); }
function formatAmount(quantity, unit) { return `${round(quantity)}${unit ? ` ${unit}` : ""}`; }

function makeGroceryList(entries) {
  const grouped = new Map();
  for (const entry of entries) {
    const recipe = entry.recipe;
    if (!recipe || recipe.status === "draft" || !Array.isArray(recipe.ingredients)) continue;
    const originalServings = Number.isInteger(recipe.servings) && recipe.servings > 0 ? recipe.servings : 1;
    const plannedServings = Number.isInteger(entry.servingsPlanned) && entry.servingsPlanned > 0
      ? entry.servingsPlanned : originalServings;
    const multiplier = plannedServings / originalServings;

    for (const ingredient of recipe.ingredients) {
      const rawName = String(ingredient.name ?? "").trim().replace(/\s+/g, " ");
      if (!rawName) continue;
      const normalizedName = rawName.toLocaleLowerCase("en");
      const { family, factor, label } = unitInfo(ingredient.unit);
      const key = `${normalizedName}\u0000${family}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          id: `${normalizedName}|${family}`, name: rawName.charAt(0).toUpperCase() + rawName.slice(1),
          category: categoryFor(normalizedName), family, unit: label, units: new Set(),
          totalBase: 0, hasNumeric: false, otherAmounts: [], occurrences: 0
        });
      }
      const item = grouped.get(key);
      item.occurrences++;
      item.units.add(label);
      const rawQuantity = String(ingredient.quantity ?? "").trim();
      const numeric = parseQuantity(rawQuantity);
      if (numeric !== null) {
        item.hasNumeric = true;
        item.totalBase += numeric * factor * multiplier;
      } else {
        item.otherAmounts.push(`${rawQuantity || "amount not specified"}${label ? ` ${label}` : ""}`);
      }
    }
  }

  return [...grouped.values()].map((item) => {
    const singleUnit = item.units.size === 1;
    let unit = item.unit;
    let quantity = item.totalBase;
    if (!singleUnit && item.family === "mass") {
      unit = quantity >= 1000 ? "kg" : "g";
      quantity /= quantity >= 1000 ? 1000 : 1;
    } else if (!singleUnit && item.family === "volume") {
      unit = quantity >= 1000 ? "l" : "ml";
      quantity /= quantity >= 1000 ? 1000 : 1;
    } else if (item.family === "mass" || item.family === "volume") {
      const { factor } = unitInfo(unit);
      quantity /= factor;
    }
    return {
      id: item.id,
      name: item.name,
      category: item.category,
      unit,
      occurrences: item.occurrences,
      numericBase: item.totalBase,
      otherAmounts: item.otherAmounts,
      amount: [item.hasNumeric ? formatAmount(quantity, unit) : "", ...item.otherAmounts]
        .filter(Boolean).join(" + ") || "Amount not specified"
    };
  }).sort((a, b) => CATEGORIES.indexOf(a.category) - CATEGORIES.indexOf(b.category) ||
    a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

module.exports = { parseQuantity, makeGroceryList, categoryFor, unitInfo, CATEGORIES };
