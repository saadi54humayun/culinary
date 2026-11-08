const Recipe = require("../models/Recipe");
const SavedRecipe = require("../models/SavedRecipe");

const PUBLISHED = { $or: [{ status: "published" }, { status: { $exists: false } }] };
const PAGE_SIZE = 18;
const { escapeRegExp } = require("../utils/mealPlanAiValidation");

async function searchPlannerRecipes(req, res) {
  const { scope = "saved", search = "", page = "0" } = req.query;
  if (!["saved", "mine", "discover"].includes(scope) || typeof search !== "string" ||
    search.length > 100 || typeof page !== "string" || !/^(0|[1-9]\d?)$/.test(page) || Number(page) > 49) {
    return res.status(400).json({ message: "Invalid recipe search filters." });
  }

  try {
    const filters = [PUBLISHED];
    if (scope === "mine") filters.push({ author: req.user._id });
    if (scope === "saved") {
      const savedIds = await SavedRecipe.distinct("recipe", { user: req.user._id });
      if (!savedIds.length) return res.json({ recipes: [], hasMore: false, nextPage: null });
      filters.push({ _id: { $in: savedIds } });
    }
    if (search.trim()) {
      const query = new RegExp(escapeRegExp(search.trim()), "i");
      filters.push({ $or: [{ title: query }, { "ingredients.name": query }, { description: query }] });
    }

    const results = await Recipe.find({ $and: filters })
      .select("title imageUrl description category servings prepTimeMinutes cookTimeMinutes author")
      .sort({ createdAt: -1, _id: -1 })
      .skip(Number(page) * PAGE_SIZE)
      .limit(PAGE_SIZE + 1)
      .populate("author", "username displayName")
      .lean();
    const hasMore = results.length > PAGE_SIZE && Number(page) < 49;
    return res.json({
      recipes: results.slice(0, PAGE_SIZE),
      hasMore,
      nextPage: hasMore ? Number(page) + 1 : null
    });
  } catch (error) {
    console.error("Searching planner recipes failed:", error.message);
    return res.status(500).json({ message: "Unable to search recipes right now." });
  }
}

module.exports = { searchPlannerRecipes };
