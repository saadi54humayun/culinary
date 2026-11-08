const MEAL_TYPES = new Set(["breakfast", "lunch", "dinner"]);

function validatePreferences(body) {
  const { goal = "balanced", diet = "any", maxMinutes = "any", notes = "", overwriteExisting = false } = body || {};
  if (!["balanced", "highprotein", "variety"].includes(goal) ||
    !["any", "vegetarian", "vegan"].includes(diet) ||
    !["any", 30, 45, 60, 90, 120].includes(maxMinutes) ||
    typeof notes !== "string" || notes.length > 500 || typeof overwriteExisting !== "boolean") return null;
  return { goal, diet, maxMinutes, notes: notes.trim(), overwriteExisting };
}

function validateBatch(meals) {
  if (!Array.isArray(meals) || meals.length < 1 || meals.length > 21) return false;
  const used = new Set();
  for (const meal of meals) {
    if (!meal || !Number.isInteger(meal.day) || meal.day < 0 || meal.day > 6 ||
      !MEAL_TYPES.has(meal.mealType) || typeof meal.recipeId !== "string" ||
      !/^[a-fA-F0-9]{24}$/.test(meal.recipeId)) return false;
    const slot = `${meal.day}:${meal.mealType}`;
    if (used.has(slot)) return false;
    used.add(slot);
  }
  return true;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = { validatePreferences, validateBatch, escapeRegExp };
