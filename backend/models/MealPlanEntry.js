const mongoose = require("mongoose");

// One document per meal slot, rather than a single large document for an entire week.
// This makes updating one meal atomic and avoids overwriting other days.
const mealPlanEntrySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    // The Monday of this week in YYYY-MM-DD form. It is a calendar label,
    // not a timestamp, so changing time zones does not move meals.
    weekStart: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/
    },
    day: {
      type: Number,
      required: true,
      min: 0,
      max: 6
    },
    mealType: {
      type: String,
      required: true,
      enum: ["breakfast", "lunch", "dinner"]
    },
    recipe: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Recipe",
      required: true
    },
    // Missing on older plans: treat as the recipe's original serving count.
    servingsPlanned: {
      type: Number,
      min: 1,
      max: 100,
      validate: { validator: Number.isInteger, message: "Servings must be a whole number." }
    }
  },
  { timestamps: true }
);

mealPlanEntrySchema.index(
  { user: 1, weekStart: 1, day: 1, mealType: 1 },
  { unique: true }
);

module.exports = mongoose.model("MealPlanEntry", mealPlanEntrySchema);
