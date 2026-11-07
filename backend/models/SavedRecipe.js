const mongoose = require("mongoose");

const savedRecipeSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    recipe: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Recipe",
      required: true
    }
  },
  { timestamps: true }
);

savedRecipeSchema.index(
  { user: 1, recipe: 1 },
  { unique: true }
);

module.exports = mongoose.model("SavedRecipe", savedRecipeSchema);