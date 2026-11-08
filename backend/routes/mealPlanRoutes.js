const express = require("express");
const requireAuth = require("../middlewares/requireAuth");
const { getWeek, setMeal, updateServings, removeMeal, getGroceryList, getNutritionSummary, analyzeWeekNutrition } = require("../controllers/mealPlanController");

const { searchPlannerRecipes } = require("../controllers/mealPlanRecipeController");
const { generatePlan, applyPlan } = require("../controllers/mealPlanAiController");

const router = express.Router();
router.use(requireAuth);

router.get("/recipes", searchPlannerRecipes);
router.post("/:weekStart/suggestions", generatePlan);
router.post("/:weekStart/apply-suggestions", applyPlan);
router.get("/:weekStart/grocery-list", getGroceryList);
router.get("/:weekStart/nutrition", getNutritionSummary);
router.post("/:weekStart/nutrition/analyze", analyzeWeekNutrition);
router.get("/:weekStart", getWeek);
router.put("/:weekStart/:day/:mealType", setMeal);
router.patch("/:weekStart/:day/:mealType/servings", updateServings);
router.delete("/:weekStart/:day/:mealType", removeMeal);

module.exports = router;
