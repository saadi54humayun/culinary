// Cooking progress is private to a user and a recipe. Never trust a client-supplied
// recipe revision or user ID; those values come from the authenticated request.
const { createHash } = require("node:crypto");
const MAX_TIMER_SECONDS = 6 * 60 * 60;

function recipeVersion(recipe) {
  // Nutrition recalculations must not clear an active cooking session.
  return createHash("sha256").update(JSON.stringify({
    ingredients: recipe.ingredients.map((item) => [item.name, item.quantity, item.unit]),
    steps: recipe.steps, servings: recipe.servings
  })).digest("hex");
}

function freshProgress(recipe) {
  return {
    stepIndex: 0,
    checkedIngredients: [],
    servings: recipe.servings || 1,
    completed: false,
    timer: { stepIndex: null, remainingSeconds: 0, running: false, endsAt: null }
  };
}

function normalizeTimer(timer, now = Date.now()) {
  if (!timer || !timer.running) {
    return {
      stepIndex: timer?.stepIndex ?? null,
      remainingSeconds: timer?.remainingSeconds ?? 0,
      running: false,
      endsAt: null
    };
  }
  const secondsLeft = Math.max(0, Math.ceil((new Date(timer.endsAt).getTime() - now) / 1000));
  if (!secondsLeft) return { stepIndex: timer.stepIndex, remainingSeconds: 0, running: false, endsAt: null };
  return {
    stepIndex: timer.stepIndex,
    remainingSeconds: secondsLeft,
    running: true,
    endsAt: timer.endsAt
  };
}

function validInteger(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

function validateCookingProgress(input, recipe, now = Date.now()) {
  const count = recipe.steps?.length || 0;
  const ingredientCount = recipe.ingredients?.length || 0;
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Cooking progress must be an object.");
  }
  if (!count || !validInteger(input.stepIndex, 0, count - 1)) {
    throw new Error("Cooking step is invalid.");
  }
  if (!validInteger(input.servings, 1, 100)) {
    throw new Error("Servings must be between 1 and 100.");
  }
  if (typeof input.completed !== "boolean") {
    throw new Error("Cooking completion status is invalid.");
  }
  if (!Array.isArray(input.checkedIngredients) ||
      input.checkedIngredients.length > 1000 ||
      input.checkedIngredients.some((i) => !validInteger(i, 0, ingredientCount - 1))) {
    throw new Error("Ingredient checklist is invalid.");
  }
  const timer = input.timer;
  if (!timer || typeof timer !== "object" || Array.isArray(timer) ||
      typeof timer.running !== "boolean" ||
      !validInteger(timer.remainingSeconds, 0, MAX_TIMER_SECONDS) ||
      (timer.stepIndex !== null && !validInteger(timer.stepIndex, 0, count - 1))) {
    throw new Error("Cooking timer is invalid.");
  }
  if (timer.running) {
    const end = Date.parse(timer.endsAt);
    if (timer.stepIndex === null || !Number.isFinite(end) ||
        end > now + MAX_TIMER_SECONDS * 1000 + 5000 ||
        end < now - MAX_TIMER_SECONDS * 1000) {
      throw new Error("Cooking timer deadline is invalid.");
    }
  } else if (timer.endsAt != null) {
    throw new Error("Paused cooking timers cannot have a deadline.");
  }
  return {
    stepIndex: input.stepIndex,
    checkedIngredients: [...new Set(input.checkedIngredients)].sort((a, b) => a - b),
    servings: input.servings,
    completed: input.completed,
    timer: normalizeTimer(timer, now)
  };
}

module.exports = { freshProgress, normalizeTimer, validateCookingProgress, recipeVersion, MAX_TIMER_SECONDS };
