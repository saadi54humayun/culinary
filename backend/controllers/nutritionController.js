const Recipe = require("../models/Recipe");
const { ensureNutrition, NutritionApiError } = require("../services/nutritionService");

async function analyzeRecipeNutrition(req, res) {
  const { id } = req.params;
  if (!/^[a-fA-F0-9]{24}$/.test(id)) {
    return res.status(400).json({ message: "Invalid recipe ID." });
  }
  try {
    const recipe = await Recipe.findById(id);
    if (!recipe || (recipe.status === "draft" && String(recipe.author) !== String(req.user._id))) {
      return res.status(404).json({ message: "Recipe not found." });
    }
    if (!Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0 || !recipe.servings) {
      return res.status(422).json({ message: "Add ingredients and servings before analyzing nutrition." });
    }
    const nutrition = await ensureNutrition(recipe);
    return res.json({ nutrition });
  } catch (error) {
    if (error instanceof NutritionApiError) return res.status(error.status).json({ message: error.message });
    console.error("Recipe nutrition analysis failed:", error.message);
    return res.status(500).json({ message: "Unable to calculate nutrition." });
  }
}

module.exports = { analyzeRecipeNutrition };
