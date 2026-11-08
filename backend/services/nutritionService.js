const Recipe = require("../models/Recipe");
const {
  cleanName, amountInGrams, nutritionFingerprint,
  emptyNutrients, addNutrients, roundedNutrients
} = require("../utils/nutrition");

const USDA_BASE = "https://api.nal.usda.gov/fdc/v1";
const cache = new Map(); // Per-process lookup cache; per-recipe nutrition is persisted in MongoDB.
const inFlight = new Map();
const SEARCH_TTL_MS = 12 * 60 * 60 * 1000;
const NOISE_WORDS = /\b(fresh|organic|finely|roughly|thinly|diced|chopped|minced|sliced|peeled|washed|raw)\b/g;

class NutritionApiError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}

function searchTerm(name) {
  const term = cleanName(name).replace(NOISE_WORDS, " ").replace(/\s+/g, " ").trim();
  // Keep ingredient specificity where useful; don't infer a complete dish.
  const aliases = {
    "atta": "whole wheat flour", "maida": "wheat flour", "dahi": "plain yogurt",
    "curd": "plain yogurt", "ghee": "clarified butter", "anda": "egg",
    "eggs": "egg", "chilli": "chili pepper", "chillies": "chili pepper",
    "coriander leaves": "cilantro", "capsicum": "bell pepper"
  };
  return aliases[term] || term;
}

function stem(word) {
  if (word.endsWith("oes") && word.length > 4) return word.slice(0, -2);
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith("s") && word.length > 3 && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function matchScore(candidate, term) {
  const description = cleanName(candidate.description).replace(/[^a-z0-9 ]/g, " ");
  const words = term.split(/\W+/).filter(Boolean).map(stem);
  const candidateWords = description.split(/\s+/).map(stem);
  if (!words.every((word) => candidateWords.includes(word))) return -1;
  let score = words.length * 10 - description.split(/\s+/).length * 0.15;
  if (description.startsWith(term)) score += 6;
  if (/\braw\b/.test(description)) score += 2;
  if (/\b(cooked|fried|breaded|restaurant|fast food)\b/.test(description) && !/\b(cooked|fried)\b/.test(term)) score -= 5;
  if (candidate.dataType === "Foundation") score += 3;
  if (candidate.dataType === "SR Legacy") score += 2;
  return score;
}

function nutrientValue(food, identifiers, unit) {
  const nutrient = food.foodNutrients?.find((item) =>
    identifiers.includes(Number(item.nutrientId ?? item.nutrient?.id)) &&
    (!unit || cleanName(item.unitName ?? item.nutrient?.unitName) === unit)
  );
  const amount = nutrient?.value ?? nutrient?.amount;
  return amount === undefined || amount === null || !Number.isFinite(Number(amount)) ? null : Number(amount);
}

function per100Grams(food) {
  const protein = nutrientValue(food, [1003], "g");
  const carbs = nutrientValue(food, [1005], "g");
  const fat = nutrientValue(food, [1004], "g");
  const fiber = nutrientValue(food, [1079], "g");
  // Foundation foods use Atwater energy (2047/2048) rather than 1008.
  const calories = nutrientValue(food, [1008, 2048, 2047], "kcal") ??
    (protein !== null && carbs !== null && fat !== null ? protein * 4 + carbs * 4 + fat * 9 : null);
  if (calories === null || protein === null || carbs === null || fat === null) return null;
  return { calories, protein, carbs, fat, fiber: fiber ?? 0 };
}

async function fetchUsdaFood(term) {
  const key = process.env.USDA_API?.trim();
  if (!key) throw new NutritionApiError("USDA_API is not configured in the backend environment.", 503);
  const url = `${USDA_BASE}/foods/search?api_key=${encodeURIComponent(key)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: term, dataType: ["Foundation", "SR Legacy", "Survey (FNDDS)"], pageSize: 15 }),
      signal: controller.signal
    });
    if (response.status === 429) throw new NutritionApiError("USDA rate limit reached. Please try later.", 503);
    if (!response.ok) throw new NutritionApiError("USDA nutrition service is unavailable.", 503);
    const result = await response.json();
    const candidates = (result.foods || [])
      .map((food) => ({ food, score: matchScore(food, term), nutrients: per100Grams(food) }))
      .filter((value) => value.score >= 0 && value.nutrients)
      .sort((a, b) => b.score - a.score);
    if (!candidates.length) return null;
    const best = candidates[0];
    return { fdcId: best.food.fdcId, description: best.food.description,
      dataType: best.food.dataType, nutrients: best.nutrients };
  } catch (error) {
    if (error instanceof NutritionApiError) throw error;
    throw new NutritionApiError(error.name === "AbortError" ? "USDA request timed out." : "Could not reach USDA nutrition service.", 503);
  } finally {
    clearTimeout(timeout);
  }
}

function getFood(term) {
  const cached = cache.get(term);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.value);
  if (inFlight.has(term)) return inFlight.get(term);
  const pending = fetchUsdaFood(term).then((value) => {
    if (cache.size > 500) cache.delete(cache.keys().next().value);
    cache.set(term, { value, expiresAt: Date.now() + SEARCH_TTL_MS });
    return value;
  }).finally(() => inFlight.delete(term));
  inFlight.set(term, pending);
  return pending;
}

async function withConcurrency(items, workers, mapper) {
  const results = new Array(items.length);
  let position = 0;
  await Promise.all(Array.from({ length: Math.min(workers, items.length) }, async () => {
    while (position < items.length) {
      const index = position++;
      results[index] = await mapper(items[index], index);
    }
  }));
  return results;
}

async function calculateRecipeNutrition(recipe) {
  const ingredients = recipe.ingredients || [];
  const ingredientResults = await withConcurrency(ingredients, 3, async (ingredient) => {
    const name = String(ingredient.name || "").trim();
    if (!name) return { name: "Unnamed ingredient", reason: "Ingredient name is missing." };
    const weight = amountInGrams(ingredient);
    if (!weight.grams) return { name, reason: weight.reason };
    const term = searchTerm(name);
    if (!term) return { name, reason: "Ingredient name is missing." };
    const food = await getFood(term);
    if (!food) return { name, reason: "No reliable USDA food match was found." };
    const factor = weight.grams / 100;
    const nutrients = roundedNutrients(addNutrients(emptyNutrients(), food.nutrients, factor));
    return { name, grams: weight.grams, approximateWeight: weight.approximate,
      fdcId: food.fdcId, matchedFood: food.description, nutrients };
  });
  const matched = ingredientResults.filter((item) => item.nutrients);
  const total = roundedNutrients(matched.reduce((sum, item) => addNutrients(sum, item.nutrients), emptyNutrients()));
  const count = Number(recipe.servings) || 1;
  const missingIngredients = ingredientResults.filter((item) => !item.nutrients)
    .map(({ name, reason }) => ({ name, reason }));
  return {
    source: "USDA FoodData Central", fingerprint: nutritionFingerprint(recipe),
    status: matched.length === 0 ? "unavailable" : missingIngredients.length ? "partial" : "ready",
    total, perServing: roundedNutrients(addNutrients(emptyNutrients(), total, 1 / count)),
    matchedCount: matched.length, ingredientCount: ingredients.length,
    missingIngredients, matches: matched,
    calculatedAt: new Date()
  };
}

const calculations = new Map();
async function ensureNutrition(recipe, { force = false } = {}) {
  const fingerprint = nutritionFingerprint(recipe);
  if (!force && recipe.nutrition?.fingerprint === fingerprint && recipe.nutrition.status) return recipe.nutrition;
  const key = `${recipe._id}:${fingerprint}`;
  if (calculations.has(key)) return calculations.get(key);
  const job = (async () => {
    const value = await calculateRecipeNutrition(recipe);
    // Never overwrite estimates if ingredients changed during the USDA requests.
    const filter = { _id: recipe._id, updatedAt: recipe.updatedAt };
    const saved = await Recipe.updateOne(filter, { $set: { nutrition: value } });
    if (!saved.matchedCount) {
      const latest = await Recipe.findById(recipe._id);
      if (!latest) throw new NutritionApiError("Recipe no longer exists.", 404);
      return ensureNutrition(latest);
    }
    return value;
  })().finally(() => calculations.delete(key));
  calculations.set(key, job);
  return job;
}

module.exports = { NutritionApiError, searchTerm, matchScore, per100Grams, calculateRecipeNutrition, ensureNutrition };
