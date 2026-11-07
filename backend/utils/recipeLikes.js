const Like = require("../models/Like");
const SavedRecipe = require("../models/SavedRecipe");
const Comment = require("../models/Comment");

async function enrichRecipesWithLikes(recipes, userId) {
  if (recipes.length === 0) return [];

  const recipeIds = recipes.map((recipe) => recipe._id);
  const [counts, likedRecipes, savedRecipes, commentCounts] = await Promise.all([
    Like.aggregate([
      { $match: { recipe: { $in: recipeIds } } },
      { $group: { _id: "$recipe", likesCount: { $sum: 1 } } }
    ]),
    Like.find({ user: userId, recipe: { $in: recipeIds } })
      .select("recipe")
      .lean(),
    SavedRecipe.find({ user: userId, recipe: { $in: recipeIds } })
      .select("recipe")
      .lean()
    ,
    Comment.aggregate([
      { $match: { recipe: { $in: recipeIds } } },
      { $group: { _id: "$recipe", commentsCount: { $sum: 1 } } }
    ])
  ]);

  const countByRecipeId = new Map(
    counts.map((count) => [count._id.toString(), count.likesCount])
  );
  const likedRecipeIds = new Set(
    likedRecipes.map((like) => like.recipe.toString())
  );
  const savedRecipeIds = new Set(
    savedRecipes.map((savedRecipe) => savedRecipe.recipe.toString())
  );
  const commentsCountByRecipeId = new Map(
    commentCounts.map((count) => [count._id.toString(), count.commentsCount])
  );

  return recipes.map((recipe) => {
    const plainRecipe =
      typeof recipe.toObject === "function" ? recipe.toObject() : recipe;
    const recipeId = plainRecipe._id.toString();

    return {
      ...plainRecipe,
      likesCount: countByRecipeId.get(recipeId) || 0,
      commentsCount: commentsCountByRecipeId.get(recipeId) || 0,
      likedByMe: likedRecipeIds.has(recipeId),
      savedByMe: savedRecipeIds.has(recipeId)
    };
  });
}

module.exports = { enrichRecipesWithLikes };
