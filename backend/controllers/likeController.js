const Like = require("../models/Like");
const Recipe = require("../models/Recipe");
const { createNotification, removeNotification } = require("../utils/notifications");

function isValidId(id) {
  return /^[a-fA-F0-9]{24}$/.test(id);
}

async function sendLikeState(res, recipeId, likedByMe) {
  const likesCount = await Like.countDocuments({ recipe: recipeId });

  return res.status(200).json({ likedByMe, likesCount });
}

async function likeRecipe(req, res) {
  try {
    const { recipeId } = req.params;

    if (!isValidId(recipeId)) {
      return res.status(400).json({ message: "Invalid recipe ID." });
    }

    const recipe = await Recipe.findOne({
      _id: recipeId,
      $or: [{ status: "published" }, { status: { $exists: false } }]
    });

    if (!recipe) {
      return res.status(404).json({ message: "Recipe not found." });
    }

    try {
      const result = await Like.updateOne(
        { user: req.user._id, recipe: recipeId },
        {
          $setOnInsert: {
            user: req.user._id,
            recipe: recipeId
          }
        },
        { upsert: true }
      );
      if (result.upsertedCount) await createNotification({ recipient: recipe.author, actor: req.user._id, type: "like", recipe: recipe._id, eventKey: `like:${req.user._id}:${recipe._id}` });
    } catch (error) {
      // A concurrent request may win the unique-index race. The recipe is
      // still liked by this user, so the successful state is the same.
      if (error.code !== 11000) throw error;
    }

    return sendLikeState(res, recipeId, true);
  } catch (error) {
    console.error("Liking recipe failed:", error.message);

    return res.status(500).json({
      message: "Unable to like this recipe. Please try again."
    });
  }
}

async function unlikeRecipe(req, res) {
  try {
    const { recipeId } = req.params;

    if (!isValidId(recipeId)) {
      return res.status(400).json({ message: "Invalid recipe ID." });
    }

    const recipeExists = await Recipe.exists({
      _id: recipeId,
      $or: [{ status: "published" }, { status: { $exists: false } }]
    });

    if (!recipeExists) {
      return res.status(404).json({ message: "Recipe not found." });
    }

    await Like.deleteOne({ user: req.user._id, recipe: recipeId });
    await removeNotification(`like:${req.user._id}:${recipeId}`);

    return sendLikeState(res, recipeId, false);
  } catch (error) {
    console.error("Unliking recipe failed:", error.message);

    return res.status(500).json({
      message: "Unable to unlike this recipe. Please try again."
    });
  }
}

module.exports = { likeRecipe, unlikeRecipe };
