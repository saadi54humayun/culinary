const crypto = require("node:crypto");
const { parseQuantity } = require("./groceryList");

const FIELDS = ["calories", "protein", "carbs", "fat", "fiber"];
const emptyNutrients = () => Object.fromEntries(FIELDS.map((field) => [field, 0]));
const round = (value) => Math.round((value + Number.EPSILON) * 10) / 10;

// USDA reports nutrients for a 100 g edible portion. Mass is exact as entered;
// count and volume-to-mass conversions below are approximate and clearly noted.
const UNIT_GRAMS = {
  g: 1, gram: 1, grams: 1, gm: 1, kg: 1000, kilogram: 1000, kilograms: 1000,
  mg: 0.001, oz: 28.3495, ounce: 28.3495, ounces: 28.3495,
  lb: 453.592, lbs: 453.592, pound: 453.592, pounds: 453.592
};
const UNIT_ML = {
  ml: 1, milliliter: 1, milliliters: 1, millilitre: 1, millilitres: 1,
  l: 1000, liter: 1000, liters: 1000, litre: 1000, litres: 1000,
  tsp: 5, teaspoon: 5, teaspoons: 5,
  tbsp: 15, tablespoon: 15, tablespoons: 15,
  cup: 240, cups: 240,
  "fl oz": 29.5735
};
const DENSITIES = [
  [/\b(oil|ghee)\b/, .92], [/\bhoney\b/, 1.42], [/\b(sugar|jaggery)\b/, .85],
  [/\b(flour|atta|maida)\b/, .53], [/\b(rice|oats)\b/, .78],
  [/\b(milk|yogurt|yoghurt|curd|cream)\b/, 1.03],
  [/\b(water|juice|broth|stock|vinegar|soy sauce)\b/, 1],
  [/\b(butter|peanut butter)\b/, .96], [/\b(salt)\b/, 1.2],
  [/\b(ground|powder|cumin|turmeric|paprika|chili|chilli|cinnamon|spice|masala)\b/, .5]
];
const PORTIONS = [
  [/\b(eggs?|anda)\b/, 50], [/\b(onions?)\b/, 110], [/\b(tomato(?:es)?)\b/, 120],
  [/\b(potato(?:es)?)\b/, 170], [/\b(bananas?)\b/, 118], [/\b(apples?)\b/, 180],
  [/\b(lemons?)\b/, 58], [/\b(limes?)\b/, 67], [/\b(garlic cloves?)\b/, 3],
  [/\b(cloves? of garlic)\b/, 3], [/\b(chicken breasts?)\b/, 170],
  [/\b(bread slices?)\b/, 30]
];

function cleanName(name) {
  return String(name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function nutritionFingerprint(recipe) {
  const canonical = {
    servings: Number(recipe.servings) || 1,
    ingredients: (recipe.ingredients || []).map((item) => [
      cleanName(item.name), String(item.quantity ?? "").trim(), String(item.unit ?? "").trim().toLowerCase()
    ])
  };
  return crypto.createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function amountInGrams(ingredient) {
  const amount = parseQuantity(ingredient.quantity);
  if (amount === null || !Number.isFinite(amount) || amount <= 0) {
    return { reason: "Quantity must be a positive number (for example 1, 1/2 or 1 1/2)." };
  }
  const unit = cleanName(ingredient.unit).replace(/\.$/, "");
  const name = cleanName(ingredient.name);
  if (UNIT_GRAMS[unit]) return { grams: round(amount * UNIT_GRAMS[unit]), approximate: false };
  if (UNIT_ML[unit]) {
    const density = DENSITIES.find(([pattern]) => pattern.test(name))?.[1];
    if (!density) return { reason: `No safe grams conversion for ${unit} of ${ingredient.name}.` };
    return { grams: round(amount * UNIT_ML[unit] * density), approximate: true };
  }
  if (!unit || /^(pcs?|pieces?|units?|whole|large|medium|small|each)$/.test(unit)) {
    const weight = PORTIONS.find(([pattern]) => pattern.test(name))?.[1];
    if (!weight) return { reason: `No edible-weight estimate for individual ${ingredient.name}.` };
    return { grams: round(amount * weight), approximate: true };
  }
  return { reason: `Unsupported unit: ${ingredient.unit}.` };
}

function addNutrients(target, source, multiplier = 1) {
  for (const field of FIELDS) target[field] += (Number(source?.[field]) || 0) * multiplier;
  return target;
}
function roundedNutrients(value) {
  return Object.fromEntries(FIELDS.map((field) => [field, round(value[field] || 0)]));
}

function nutritionForWeek(entries) {
  const days = Array.from({ length: 7 }, (_, day) => ({
    day, totals: emptyNutrients(), plannedMeals: 0, analyzedMeals: 0, incompleteMeals: 0
  }));
  const meals = [];
  const uncalculated = new Set();
  const totals = emptyNutrients();
  for (const entry of entries) {
    const recipe = entry.recipe;
    if (!recipe || recipe.status === "draft" || !Number.isInteger(entry.day) || entry.day < 0 || entry.day > 6) continue;
    const day = days[entry.day];
    day.plannedMeals++;
    const servingsPlanned = Number.isInteger(entry.servingsPlanned) && entry.servingsPlanned > 0
      ? entry.servingsPlanned : (Number(recipe.servings) || 1);
    const cached = recipe.nutrition;
    const cacheCurrent = cached && cached.fingerprint === nutritionFingerprint(recipe);
    const valid = cacheCurrent && ["ready", "partial"].includes(cached.status) && cached.perServing;
    const unavailable = cacheCurrent && cached.status === "unavailable";
    const item = { day: entry.day, mealType: entry.mealType, recipeId: String(recipe._id),
      title: recipe.title, servingsPlanned,
      status: valid ? cached.status : unavailable ? "unavailable" : "not_analyzed", totals: null };
    if (valid) {
      item.totals = roundedNutrients(addNutrients(emptyNutrients(), cached.perServing, servingsPlanned));
      addNutrients(totals, item.totals);
      addNutrients(day.totals, item.totals);
      day.analyzedMeals++;
      if (cached.status === "partial") day.incompleteMeals++;
    } else {
      if (!unavailable) uncalculated.add(String(recipe._id));
      day.incompleteMeals++;
    }
    meals.push(item);
  }
  for (const day of days) day.totals = roundedNutrients(day.totals);
  const analyzedMeals = days.reduce((total, day) => total + day.analyzedMeals, 0);
  const incompleteMeals = days.reduce((total, day) => total + day.incompleteMeals, 0);
  return {
    totals: roundedNutrients(totals),
    dailyAverage: roundedNutrients(addNutrients(emptyNutrients(), totals, 1 / 7)),
    days, meals, analyzedMeals, incompleteMeals,
    plannedMeals: meals.length, uncalculatedRecipeIds: [...uncalculated],
    complete: incompleteMeals === 0
  };
}

module.exports = {
  FIELDS, emptyNutrients, roundedNutrients, addNutrients, cleanName,
  nutritionFingerprint, amountInGrams, nutritionForWeek
};
