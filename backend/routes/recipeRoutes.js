const express = require("express");
const requireAuth = require("../middlewares/requireAuth");
const {createRecipe, getMyRecipes, deleteRecipe, updateRecipe, getFeed, getRecipeById} = require("../controllers/recipeController");
const { naturalSearch } = require("../controllers/naturalSearchController");
const { likeRecipe, unlikeRecipe } = require("../controllers/likeController");
const { analyzeRecipeNutrition } = require("../controllers/nutritionController");
const { getCookingProgress, putCookingProgress, deleteCookingProgress } = require("../controllers/cookingProgressController");


const router = express.Router();

router.post("/", requireAuth, createRecipe);
router.post("/natural-search", requireAuth, naturalSearch);
router.get("/", requireAuth, getFeed);
router.get("/mine", requireAuth, getMyRecipes);
router.put("/:recipeId/like", requireAuth, likeRecipe);
router.delete("/:recipeId/like", requireAuth, unlikeRecipe);
router.post("/:id/nutrition/analyze", requireAuth, analyzeRecipeNutrition);
router.get("/:id/cook-progress", requireAuth, getCookingProgress);
router.put("/:id/cook-progress", requireAuth, putCookingProgress);
router.delete("/:id/cook-progress", requireAuth, deleteCookingProgress);
router.get("/:id", requireAuth, getRecipeById);
router.delete("/:id", requireAuth, deleteRecipe);
router.patch("/:id", requireAuth, updateRecipe);

module.exports = router;
