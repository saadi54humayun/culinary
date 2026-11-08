const Recipe = require("../models/Recipe");
const MealPlanEntry = require("../models/MealPlanEntry");
const PantryItem = require("../models/PantryItem");
const { applyPantryToGroceryList } = require("../utils/pantry");
const { makeGroceryList } = require("../utils/groceryList");
const { nutritionForWeek, nutritionFingerprint } = require("../utils/nutrition");
const { ensureNutrition, NutritionApiError } = require("../services/nutritionService");

const MEAL_TYPES = new Set(["breakfast", "lunch", "dinner"]);
const PUBLISHED_FILTER = {
  $or: [{ status: "published" }, { status: { $exists: false } }]
};

function validMonday(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value && date.getUTCDay() === 1;
}

function validateWeek(req, res) {
  if (!validMonday(req.params.weekStart)) {
    res.status(400).json({ message: "weekStart must be a valid Monday (YYYY-MM-DD)." });
    return false;
  }
  return true;
}

function validateSlot(req, res) {
  if (!validateWeek(req, res)) return false;
  if (!/^[0-6]$/.test(req.params.day) || !MEAL_TYPES.has(req.params.mealType)) {
    res.status(400).json({ message: "Day or meal type is invalid." });
    return false;
  }
  return true;
}

function validServings(value) {
  return Number.isInteger(value) && value >= 1 && value <= 100;
}

const recipePopulation = {
  path: "recipe",
  select: "title imageUrl category status servings ingredients nutrition updatedAt"
};

function publicEntries(entries) {
  return entries.map((entry) => {
    const value = entry.toObject();
    if (!value.recipe || value.recipe.status === "draft") {
      value.recipe = null; // Recipe was deleted or unpublished after planning.
    }
    return value;
  });
}

async function getWeek(req, res) {
  if (!validateWeek(req, res)) return;
  try {
    const entries = await MealPlanEntry.find({
      user: req.user._id,
      weekStart: req.params.weekStart
    }).sort({ day: 1, mealType: 1 }).populate(recipePopulation);

    return res.json({ weekStart: req.params.weekStart, entries: publicEntries(entries) });
  } catch (error) {
    console.error("Loading meal plan failed:", error.message);
    return res.status(500).json({ message: "Unable to load your meal plan." });
  }
}

async function setMeal(req, res) {
  if (!validateSlot(req, res)) return;
  const { recipeId, servingsPlanned } = req.body ?? {};
  if (servingsPlanned !== undefined && !validServings(servingsPlanned)) {
    return res.status(400).json({ message: "Planned servings must be a whole number between 1 and 100." });
  }
  if (typeof recipeId !== "string" || !/^[a-fA-F0-9]{24}$/.test(recipeId)) {
    return res.status(400).json({ message: "A valid recipe ID is required." });
  }

  try {
    const published = await Recipe.findOne({ _id: recipeId, ...PUBLISHED_FILTER }).select("servings").lean();
    if (!published) return res.status(404).json({ message: "Published recipe not found." });
    const planned = servingsPlanned ?? (validServings(published.servings) ? published.servings : 1);

    const filter = {
      user: req.user._id,
      weekStart: req.params.weekStart,
      day: Number(req.params.day),
      mealType: req.params.mealType
    };

    try {
      await MealPlanEntry.findOneAndUpdate(
        filter,
        { $set: { recipe: recipeId, servingsPlanned: planned } },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
      );
    } catch (error) {
      if (error.code !== 11000) throw error;
      // Concurrent updates for the same slot: one insert won the unique index.
      await MealPlanEntry.updateOne(filter, { $set: { recipe: recipeId, servingsPlanned: planned } });
    }

    const entry = await MealPlanEntry.findOne(filter).populate(recipePopulation);
    return res.json({ message: "Meal planned.", entry: publicEntries([entry])[0] });
  } catch (error) {
    console.error("Updating meal plan failed:", error.message);
    return res.status(500).json({ message: "Unable to update your meal plan." });
  }
}

async function updateServings(req, res) {
  if (!validateSlot(req, res)) return;
  const { servingsPlanned } = req.body ?? {};
  if (!validServings(servingsPlanned)) {
    return res.status(400).json({ message: "Planned servings must be a whole number between 1 and 100." });
  }

  try {
    const filter = {
      user: req.user._id,
      weekStart: req.params.weekStart,
      day: Number(req.params.day),
      mealType: req.params.mealType
    };
    const entry = await MealPlanEntry.findOneAndUpdate(
      filter, { $set: { servingsPlanned } }, { new: true, runValidators: true }
    ).populate(recipePopulation);
    if (!entry) return res.status(404).json({ message: "No meal planned in this slot." });
    return res.json({ message: "Serving count updated.", entry: publicEntries([entry])[0] });
  } catch (error) {
    console.error("Updating planned servings failed:", error.message);
    return res.status(500).json({ message: "Unable to update planned servings." });
  }
}

async function removeMeal(req, res) {
  if (!validateSlot(req, res)) return;
  try {
    await MealPlanEntry.deleteOne({
      user: req.user._id,
      weekStart: req.params.weekStart,
      day: Number(req.params.day),
      mealType: req.params.mealType
    });
    return res.json({ message: "Meal removed." });
  } catch (error) {
    console.error("Removing planned meal failed:", error.message);
    return res.status(500).json({ message: "Unable to remove the planned meal." });
  }
}

async function getGroceryList(req, res) {
  if (!validateWeek(req, res)) return;
  try {
    const [entries, pantry] = await Promise.all([
      MealPlanEntry.find({ user: req.user._id, weekStart: req.params.weekStart }).populate(recipePopulation),
      PantryItem.find({ user: req.user._id }).lean()
    ]);
    const items = makeGroceryList(publicEntries(entries));
    const adjusted = applyPantryToGroceryList(items, pantry);
    return res.json({
      weekStart: req.params.weekStart, items,
      pantryAdjustedItems: adjusted.items,
      pantryCovered: adjusted.covered, pantryPartiallyCovered: adjusted.partiallyCovered
    });
  } catch (error) {
    console.error("Creating grocery list failed:", error.message);
    return res.status(500).json({ message: "Unable to build your grocery list." });
  }
}

async function getNutritionSummary(req, res) {
  if (!validateWeek(req, res)) return;
  try {
    const entries = await MealPlanEntry.find({
      user: req.user._id, weekStart: req.params.weekStart
    }).populate(recipePopulation);
    return res.json({ weekStart: req.params.weekStart, ...nutritionForWeek(publicEntries(entries)) });
  } catch (error) {
    console.error("Loading nutrition summary failed:", error.message);
    return res.status(500).json({ message: "Unable to load nutrition summary." });
  }
}

async function analyzeWeekNutrition(req, res) {
  if (!validateWeek(req, res)) return;
  try {
    const entries = await MealPlanEntry.find({
      user: req.user._id, weekStart: req.params.weekStart
    }).populate(recipePopulation);
    const unique = new Map();
    for (const entry of publicEntries(entries)) {
      const recipe = entry.recipe;
      if (recipe && (!recipe.nutrition || recipe.nutrition.fingerprint !== nutritionFingerprint(recipe))) {
        unique.set(String(recipe._id), recipe);
      }
    }
    // A bounded batch avoids surprising rate-limit usage for a very large week.
    const targets = [...unique.values()].slice(0, 8);
    const failures = [];
    for (const recipe of targets) {
      try {
        await ensureNutrition(recipe);
      } catch (error) {
        failures.push({ recipeId: String(recipe._id), message: error.message });
        if (error instanceof NutritionApiError && error.status === 503) break;
      }
    }
    const refreshed = await MealPlanEntry.find({
      user: req.user._id, weekStart: req.params.weekStart
    }).populate(recipePopulation);
    return res.json({ weekStart: req.params.weekStart, ...nutritionForWeek(publicEntries(refreshed)),
      attempted: targets.length, failures });
  } catch (error) {
    console.error("Analyzing weekly nutrition failed:", error.message);
    return res.status(500).json({ message: "Unable to analyze weekly nutrition." });
  }
}

module.exports = {
  getWeek, setMeal, updateServings, removeMeal, getGroceryList,
  getNutritionSummary, analyzeWeekNutrition, validMonday
};
