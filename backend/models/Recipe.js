const mongoose = require("mongoose");

const CATEGORIES = [
  "breakfast", "lunch", "dinner", "snack", "dessert", "drink", "other"
];
const EQUIPMENT = ["oven", "stovetop", "microwave", "air-fryer", "grill", "slow-cooker", "blender", "none"];

const ingredientSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    quantity: {
      type: String,
      trim: true,
      default: ""
    },
    unit: {
      type: String,
      trim: true,
      default: ""
    }
  },
  { _id: false }
);

const recipeSchema = new mongoose.Schema(
  {
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },

    description: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: ""
    },

    ingredients: {
      type: [ingredientSchema],
      required: function requiredIngredients() {
        return this.status !== "draft";
      },
      validate: {
        validator: function hasIngredients(ingredients) {
          return this.status === "draft" || ingredients.length > 0;
        },
        message: "Add at least one ingredient."
      }
    },

    steps: {
      type: [{ type: String, trim: true, required: true }],
      required: function requiredSteps() {
        return this.status !== "draft";
      },
      validate: {
        validator: function hasSteps(steps) {
          return this.status === "draft" || steps.length > 0;
        },
        message: "Add at least one cooking step."
      }
    },

    prepTimeMinutes: {
      type: Number,
      required: function requiredPrepTime() {
        return this.status !== "draft";
      },
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: "Preparation time must be a whole number."
      }
    },

    cookTimeMinutes: {
      type: Number,
      required: function requiredCookTime() {
        return this.status !== "draft";
      },
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: "Cooking time must be a whole number."
      }
    },

    servings: {
      type: Number,
      required: function requiredServings() {
        return this.status !== "draft";
      },
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: "Servings must be a whole number."
      }
    },

    imageUrl: {
      type: String,
      trim: true,
      default: ""
    },

    status: {
      type: String,
      enum: ["draft", "published"],
      default: "published"
    },

    publishedAt: {
      type: Date,
      default: null
    },

    category: {
      type: String,
      enum: CATEGORIES,
      default: "other"
    },

    // `equipmentDeclared` distinguishes a complete author declaration from
    // legacy recipes where no equipment information was collected.
    equipment: {
      type: [{ type: String, enum: EQUIPMENT }],
      default: undefined
    },

    equipmentDeclared: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

recipeSchema.index({ author: 1, createdAt: -1 });
recipeSchema.index({ status: 1, createdAt: -1, _id: -1 });

module.exports = mongoose.model("Recipe", recipeSchema);
module.exports.CATEGORIES = CATEGORIES;
module.exports.EQUIPMENT = EQUIPMENT;
