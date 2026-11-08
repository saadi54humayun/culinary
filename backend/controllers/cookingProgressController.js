const Recipe = require("../models/Recipe");
const CookingProgress = require("../models/CookingProgress");
const { freshProgress, normalizeTimer, validateCookingProgress, recipeVersion } = require("../utils/cookingProgress");

const OBJECT_ID = /^[a-f\d]{24}$/i;

async function findReadableRecipe(req, res) {
  if (!OBJECT_ID.test(req.params.id)) {
    res.status(400).json({ message: "Invalid recipe ID." });
    return null;
  }
  const recipe = await Recipe.findById(req.params.id).select("author status steps ingredients servings");
  if (!recipe || (recipe.status === "draft" && String(recipe.author) !== String(req.user._id))) {
    res.status(404).json({ message: "Recipe not found." });
    return null;
  }
  if (!recipe.steps?.length) {
    res.status(400).json({ message: "Add cooking steps before using cooking mode." });
    return null;
  }
  return recipe;
}

function serializeProgress(progress) {
  return {
    stepIndex: progress.stepIndex,
    checkedIngredients: progress.checkedIngredients,
    servings: progress.servings,
    completed: progress.completed,
    timer: normalizeTimer(progress.timer)
  };
}

async function getCookingProgress(req, res) {
  try {
    const recipe = await findReadableRecipe(req, res);
    if (!recipe) return;
    const current = await CookingProgress.findOne({ user: req.user._id, recipe: recipe._id }).lean();
    // Only cooking-related recipe edits invalidate a saved session.
    const version = recipeVersion(recipe);
    const validRevision = current && current.recipeVersion === version;
    return res.json({ recipeVersion: version, progress: serializeProgress(validRevision ? current : freshProgress(recipe)), updatedAt: validRevision ? current.updatedAt : null, resetForRecipeEdit: Boolean(current && !validRevision) });
  } catch (error) {
    console.error("Loading cooking progress failed:", error.message);
    return res.status(500).json({ message: "Unable to load cooking progress." });
  }
}

async function putCookingProgress(req, res) {
  try {
    const recipe = await findReadableRecipe(req, res);
    if (!recipe) return;
    // Avoid accepting a stale tab's save after the author has edited a recipe.
    const version = recipeVersion(recipe);
    if (req.body?.recipeVersion !== version) {
      return res.status(409).json({ message: "This recipe changed. Reload cooking mode to start with the latest steps." });
    }
    let progress;
    try {
      progress = validateCookingProgress(req.body, recipe);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
    // Opt-in optimistic concurrency for offline-capable clients. Older clients that
    // do not send baseUpdatedAt retain the original endpoint behavior.
    if (Object.prototype.hasOwnProperty.call(req.body, "baseUpdatedAt")) {
      const expected = req.body.baseUpdatedAt;
      if (expected !== null && (typeof expected !== "string" || !Number.isFinite(Date.parse(expected)))) {
        return res.status(400).json({ message: "Invalid progress revision." });
      }
      const existing = await CookingProgress.findOne({ user: req.user._id, recipe: recipe._id }).lean();
      const currentTimestamp = existing?.recipeVersion === version ? existing.updatedAt?.toISOString() || null : null;
      if (expected !== currentTimestamp) {
        return res.status(409).json({ message: "Cooking progress changed on another device. Your offline progress was kept; review before overwriting." });
      }
      let updated;
      if (existing) {
        updated = await CookingProgress.findOneAndUpdate(
          { _id: existing._id, updatedAt: existing.updatedAt },
          { $set: { ...progress, recipeVersion: version } },
          { new: true, runValidators: true }
        );
      } else {
        try {
          updated = await CookingProgress.create({ user: req.user._id, recipe: recipe._id, ...progress, recipeVersion: version });
        } catch (error) {
          if (error.code === 11000) return res.status(409).json({ message: "Cooking progress changed on another device." });
          throw error;
        }
      }
      if (!updated) return res.status(409).json({ message: "Cooking progress changed on another device. Refresh before retrying." });
      return res.json({ progress: serializeProgress(updated), updatedAt: updated.updatedAt });
    }
    const updated = await CookingProgress.findOneAndUpdate(
      { user: req.user._id, recipe: recipe._id },
      { $set: { ...progress, recipeVersion: version } },
      { upsert: true, runValidators: true, new: true, setDefaultsOnInsert: true }
    );
    return res.json({ progress: serializeProgress(updated), updatedAt: updated.updatedAt });
  } catch (error) {
    console.error("Saving cooking progress failed:", error.message);
    return res.status(500).json({ message: "Unable to save cooking progress." });
  }
}

async function deleteCookingProgress(req, res) {
  try {
    const recipe = await findReadableRecipe(req, res);
    if (!recipe) return;
    await CookingProgress.deleteOne({ user: req.user._id, recipe: recipe._id });
    return res.json({ progress: freshProgress(recipe) });
  } catch (error) {
    console.error("Resetting cooking progress failed:", error.message);
    return res.status(500).json({ message: "Unable to reset cooking progress." });
  }
}

module.exports = { getCookingProgress, putCookingProgress, deleteCookingProgress };
