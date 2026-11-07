const express = require("express");
const requireAuth = require("../middlewares/requireAuth");

const {
  saveRecipe,
  unsaveRecipe,
  getSavedRecipes,
  getSavedStatus
} = require("../controllers/savedRecipeController");

const router = express.Router();

// Every route below requires a logged-in user.
router.use(requireAuth);

router.get("/", getSavedRecipes);
router.get("/:recipeId", getSavedStatus);
router.put("/:recipeId", saveRecipe);
router.delete("/:recipeId", unsaveRecipe);

module.exports = router;