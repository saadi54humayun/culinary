const mongoose = require("mongoose");

const timerSchema = new mongoose.Schema({
  stepIndex: { type: Number, default: null },
  remainingSeconds: { type: Number, min: 0, max: 21600, default: 0 },
  running: { type: Boolean, default: false },
  endsAt: { type: Date, default: null }
}, { _id: false });

const cookingProgressSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  recipe: { type: mongoose.Schema.Types.ObjectId, ref: "Recipe", required: true },
  recipeVersion: { type: String, required: true },
  stepIndex: { type: Number, min: 0, default: 0 },
  checkedIngredients: { type: [Number], default: [] },
  servings: { type: Number, min: 1, max: 100, required: true },
  completed: { type: Boolean, default: false },
  timer: { type: timerSchema, default: () => ({}) }
}, { timestamps: true });

cookingProgressSchema.index({ user: 1, recipe: 1 }, { unique: true });
module.exports = mongoose.model("CookingProgress", cookingProgressSchema);
