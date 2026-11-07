const SavedRecipe = require("../models/SavedRecipe");
const Recipe = require("../models/Recipe");
const { enrichRecipesWithLikes } = require("../utils/recipeLikes");

function isValidId(id) {
  return /^[a-fA-F0-9]{24}$/.test(id);
}

async function saveRecipe(req, res) {
  try {
    const { recipeId } = req.params;

    if (!isValidId(recipeId)) {
      return res.status(400).json({
        message: "Invalid recipe ID."
      });
    }

    const recipeExists = await Recipe.exists({
      _id: recipeId,
      $or: [{ status: "published" }, { status: { $exists: false } }]
    });

    if (!recipeExists) {
      return res.status(404).json({
        message: "Recipe not found."
      });
    }

    await SavedRecipe.updateOne(
      {
        user: req.user._id,
        recipe: recipeId
      },
      {
        $setOnInsert: {
          user: req.user._id,
          recipe: recipeId
        }
      },
      { upsert: true }
    );

    return res.status(200).json({
      message: "Recipe saved.",
      saved: true
    });
  } catch (error) {
    // Two simultaneous save requests can hit the unique index.
    // The desired result is already achieved: the recipe is saved.
    if (error.code === 11000) {
      return res.status(200).json({
        message: "Recipe saved.",
        saved: true
      });
    }

    console.error("Saving recipe failed:", error.message);

    return res.status(500).json({
      message: "Unable to save this recipe."
    });
  }
}

async function unsaveRecipe(req, res) {
  try {
    const { recipeId } = req.params;

    if (!isValidId(recipeId)) {
      return res.status(400).json({
        message: "Invalid recipe ID."
      });
    }

    await SavedRecipe.deleteOne({
      user: req.user._id,
      recipe: recipeId
    });

    return res.status(200).json({
      message: "Recipe removed from saved recipes.",
      saved: false
    });
  } catch (error) {
    console.error("Removing saved recipe failed:", error.message);

    return res.status(500).json({
      message: "Unable to remove this saved recipe."
    });
  }
}

async function getSavedRecipes(req, res) {
  try {
    const bookmarks = await SavedRecipe.find({
      user: req.user._id
    })
      .sort({ createdAt: -1, _id: -1 })
      .populate({
        path: "recipe",
        populate: {
          path: "author",
          select: "username displayName profilePhotoUrl"
        }
      });

    const recipes = bookmarks
      .map((bookmark) => bookmark.recipe)
      .filter((recipe) => recipe !== null && recipe.status !== "draft");

    const enrichedRecipes = await enrichRecipesWithLikes(recipes, req.user._id);

    return res.status(200).json({ recipes: enrichedRecipes });
  } catch (error) {
    console.error("Fetching saved recipes failed:", error.message);

    return res.status(500).json({
      message: "Unable to load your saved recipes."
    });
  }
}

async function getSavedStatus(req, res) {
  try {
    const { recipeId } = req.params;

    if (!isValidId(recipeId)) {
      return res.status(400).json({
        message: "Invalid recipe ID."
      });
    }

    const bookmark = await SavedRecipe.exists({
      user: req.user._id,
      recipe: recipeId
    });

    return res.status(200).json({
      saved: Boolean(bookmark)
    });
  } catch (error) {
    console.error("Checking saved status failed:", error.message);

    return res.status(500).json({
      message: "Unable to check whether this recipe is saved."
    });
  }
}

module.exports = {
  saveRecipe,
  unsaveRecipe,
  getSavedRecipes,
  getSavedStatus
};
