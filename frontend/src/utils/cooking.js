// Shared presentation calculations for guided cooking. Only numeric ingredient
// quantities can be scaled; descriptive amounts such as "to taste" stay verbatim.
export function parseIngredientQuantity(value) {
  const text = String(value ?? "").trim();
  if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text);
  if (/^\d+\/\d+$/.test(text)) {
    const [a, b] = text.split("/").map(Number);
    return b ? a / b : null;
  }
  if (/^\d+\s+\d+\/\d+$/.test(text)) {
    const [whole, fraction] = text.split(/\s+/);
    const parsed = parseIngredientQuantity(fraction);
    return parsed === null ? null : Number(whole) + parsed;
  }
  return null;
}

export function scaledIngredient(ingredient, originalServings, servings) {
  const quantity = String(ingredient.quantity ?? "").trim();
  const parsed = parseIngredientQuantity(quantity);
  const base = Number(originalServings) || 1;
  const scaled = parsed === null ? quantity : String(Number((parsed * servings / base).toFixed(2)));
  return {
    text: [scaled, ingredient.unit, ingredient.name].filter(Boolean).join(" "),
    approximate: parsed === null && servings !== base && Boolean(quantity)
  };
}

export function suggestedStepSeconds(step) {
  const match = String(step ?? "").match(/\b(\d{1,3})(?:\s*[-–]\s*\d{1,3})?\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)\b/i);
  if (!match) return 300;
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const seconds = value * (unit.startsWith("hour") || unit.startsWith("hr") ? 3600 : unit.startsWith("min") ? 60 : 1);
  return seconds > 0 && seconds <= 21600 ? seconds : 300;
}

export function secondsRemaining(timer, now = Date.now()) {
  if (!timer) return 0;
  if (!timer.running) return Math.max(0, timer.remainingSeconds || 0);
  return Math.max(0, Math.ceil((new Date(timer.endsAt).getTime() - now) / 1000));
}

export function formatClock(totalSeconds) {
  const total = Math.max(0, Math.floor(totalSeconds || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total % 3600 / 60);
  const seconds = total % 60;
  const mmss = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return hours ? `${hours}:${mmss}` : mmss;
}
