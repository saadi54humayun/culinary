const Recipe = require("../models/Recipe");
const SavedRecipe = require("../models/SavedRecipe");
const MealPlanEntry = require("../models/MealPlanEntry");
const { validMonday } = require("./mealPlanController");
const {
  matchesDiet, desiredSlots, suggestedMeals, buildPrompt, askGeminiForPlan
} = require("../services/mealPlanAiService");

const PUBLISHED = { $or: [{ status: "published" }, { status: { $exists: false } }] };
const requestTimes = new Map();
const { validatePreferences, validateBatch } = require("../utils/mealPlanAiValidation");

function canGenerate(userId) {
  const now = Date.now();
  const valid = (requestTimes.get(userId) || []).filter((time) => now - time < 10 * 60_000);
  if (valid.length >= 3) return false;
  requestTimes.set(userId, [...valid, now]);
  return true;
}

function previewRecipe(recipe) {
  return {
    _id: String(recipe._id), title: recipe.title, imageUrl: recipe.imageUrl,
    category: recipe.category, servings: recipe.servings,
    prepTimeMinutes: recipe.prepTimeMinutes, cookTimeMinutes: recipe.cookTimeMinutes
  };
}

async function generatePlan(req, res) {
  if (!validMonday(req.params.weekStart)) {
    return res.status(400).json({ message: "weekStart must be a Monday in YYYY-MM-DD format." });
  }
  const preferences = validatePreferences(req.body);
  if (!preferences) return res.status(400).json({ message: "Invalid meal plan preferences." });
  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({ message: "Set GEMINI_API_KEY in the backend to enable AI meal planning." });
  }
  try {
    const existing = await MealPlanEntry.find({ user: req.user._id, weekStart: req.params.weekStart })
      .populate({ path: "recipe", select: "title category" }).lean();
    const targets = desiredSlots(existing, preferences.overwriteExisting);
    if (!targets.length) {
      return res.status(409).json({ message: "Every meal is already planned. Enable 'Replace planned meals' to generate a new week." });
    }

    const filters = [PUBLISHED];
    if (preferences.maxMinutes !== "any") {
      filters.push({ $expr: { $lte: [
        { $add: [{ $ifNull: ["$prepTimeMinutes", 0] }, { $ifNull: ["$cookTimeMinutes", 0] }] },
        preferences.maxMinutes
      ] } });
    }
    const savedIds = new Set((await SavedRecipe.distinct("recipe", { user: req.user._id })).map(String));
    const fields = "title imageUrl category servings prepTimeMinutes cookTimeMinutes ingredients nutrition";
    const [savedRecipes, recent] = await Promise.all([
      savedIds.size ? Recipe.find({ $and: [...filters, { _id: { $in: [...savedIds] } }] })
        .sort({ createdAt: -1 }).limit(60).select(fields).lean() : [],
      Recipe.find({ $and: filters }).sort({ createdAt: -1, _id: -1 })
        .limit(180).select(fields).lean()
    ]);
    const combined = new Map([...savedRecipes, ...recent].map((recipe) => [String(recipe._id), recipe]));
    const suitable = [...combined.values()].filter((recipe) =>
      (preferences.diet === "any" || recipe.ingredients?.length) && matchesDiet(recipe, preferences.diet));
    if (!suitable.length) {
      return res.status(422).json({ message: "No published recipes match those filters. Try a different diet or cooking time." });
    }

    const candidates = suitable.sort((a, b) => Number(savedIds.has(String(b._id))) - Number(savedIds.has(String(a._id)))).slice(0, 30);
    const existingNames = existing.filter((entry) => entry.recipe).map((entry) => ({
      day: entry.day, mealType: entry.mealType, title: entry.recipe.title
    }));

    if (!canGenerate(String(req.user._id))) {
      return res.status(429).json({ message: "You can generate up to three AI plans every ten minutes. Try again later." });
    }
    const output = await askGeminiForPlan(buildPrompt({ candidates, targets, existing: existingNames, ...preferences }));
    const suggestions = suggestedMeals(output, targets, candidates);
    return res.json({
      weekStart: req.params.weekStart,
      overwriteExisting: preferences.overwriteExisting,
      suggestions: suggestions.map((suggestion) => ({
        day: suggestion.day, mealType: suggestion.mealType,
        recipe: previewRecipe(suggestion.recipe), reason: suggestion.reason,
        source: suggestion.source
      })),
      fallbackCount: suggestions.filter((item) => item.source === "fallback").length,
      note: "Suggestions are estimates from existing recipes, not medical or allergen-safe dietary advice. Review ingredients before applying."
    });
  } catch (error) {
    console.error("AI meal planning failed:", error.message);
    return res.status(error.status || 502).json({
      message: error.status ? error.message : "Unable to generate a complete plan. Please try again."
    });
  }
}

async function applyPlan(req, res) {
  if (!validMonday(req.params.weekStart)) {
    return res.status(400).json({ message: "weekStart must be a Monday in YYYY-MM-DD format." });
  }
  const { meals, overwriteExisting = false } = req.body || {};
  if (!validateBatch(meals) || typeof overwriteExisting !== "boolean") {
    return res.status(400).json({ message: "Provide 1–21 unique meal slots with published recipe IDs." });
  }
  try {
    const ids = [...new Set(meals.map((meal) => meal.recipeId.toLowerCase()))];
    const recipes = await Recipe.find({ _id: { $in: ids }, ...PUBLISHED })
      .select("_id servings").lean();
    if (recipes.length !== ids.length) {
      return res.status(409).json({ message: "One of the recipes is no longer published. Refresh the plan and retry." });
    }
    const byId = new Map(recipes.map((recipe) => [String(recipe._id), recipe]));
    if (!overwriteExisting) {
      const occupied = await MealPlanEntry.find({ user: req.user._id, weekStart: req.params.weekStart,
        $or: meals.map((meal) => ({ day: meal.day, mealType: meal.mealType }))
      }).select("day mealType").lean();
      if (occupied.length) {
        return res.status(409).json({ message: "Some slots were filled since the preview. Refresh before applying." });
      }
    }

    const operations = meals.map((meal) => {
      const recipe = byId.get(meal.recipeId.toLowerCase());
      const servings = Number.isInteger(recipe.servings) && recipe.servings > 0 && recipe.servings <= 100
        ? recipe.servings : 1;
      const filter = { user: req.user._id, weekStart: req.params.weekStart, day: meal.day, mealType: meal.mealType };
      const values = { recipe: recipe._id, servingsPlanned: servings };
      return { updateOne: { filter, update: overwriteExisting
        ? { $set: values, $setOnInsert: filter }
        : { $setOnInsert: { ...filter, ...values } }, upsert: true } };
    });
    // Prevalidate the full batch. $setOnInsert protects occupied slots when
    // overwriteExisting=false, including slots created by a concurrent request.
    await MealPlanEntry.bulkWrite(operations, { ordered: true });
    const updated = await MealPlanEntry.find({ user: req.user._id, weekStart: req.params.weekStart })
      .select("day mealType recipe").lean();
    const actual = new Map(updated.map((entry) => [`${entry.day}:${entry.mealType}`, String(entry.recipe)]));
    const applied = meals.every((meal) => actual.get(`${meal.day}:${meal.mealType}`) === meal.recipeId.toLowerCase());
    if (!applied) return res.status(409).json({ message: "Some slots changed during saving. Reload your plan to check the results." });
    return res.json({ message: "Meal plan saved.", saved: meals.length });
  } catch (error) {
    console.error("Applying AI meal plan failed:", error.message);
    return res.status(500).json({ message: "Unable to save every meal. Reload the week to check if some meals were saved." });
  }
}

module.exports = { generatePlan, applyPlan };
