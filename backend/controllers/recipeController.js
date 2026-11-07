const Recipe = require("../models/Recipe");
const Comment = require("../models/Comment");
const Follow = require("../models/Follow");
const Like = require("../models/Like");
const { enrichRecipesWithLikes } = require("../utils/recipeLikes");
const { CATEGORIES, EQUIPMENT } = require("../models/Recipe");

const PUBLISHED_FILTER = {
  $or: [{ status: "published" }, { status: { $exists: false } }]
};

function isPublished(recipe) {
  return recipe.status !== "draft";
}

async function createRecipe(req, res) {
  try {
    const {
      title,
      description,
      ingredients,
      steps,
      prepTimeMinutes,
      cookTimeMinutes,
      servings,
      imageUrl,
      status,
      category,
      equipment,
      equipmentDeclared
    } = req.body ?? {};

    if (status !== undefined && !["draft", "published"].includes(status)) {
      return res.status(400).json({ message: "Recipe status is invalid." });
    }

    if (category !== undefined && !CATEGORIES.includes(category)) {
      return res.status(400).json({ message: "Recipe category is invalid." });
    }
    if (equipment !== undefined && (!Array.isArray(equipment) || equipment.length > 8 || equipment.some((item) => !EQUIPMENT.includes(item)))) {
      return res.status(400).json({ message: "Recipe equipment is invalid." });
    }

    const recipeStatus = status === "draft" ? "draft" : "published";

    const recipe = await Recipe.create({
      author: req.user._id,
      title,
      description,
      ingredients,
      steps,
      prepTimeMinutes,
      cookTimeMinutes,
      servings,
      imageUrl,
      category: category ?? "other",
      equipment: equipment ?? undefined,
      equipmentDeclared: equipmentDeclared === true,
      status: recipeStatus,
      publishedAt: recipeStatus === "published" ? new Date() : null
    });

    return res.status(201).json({
      message: "Recipe created successfully.",
      recipe: (await enrichRecipesWithLikes([recipe], req.user._id))[0],
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({
        message: "Please check your recipe details.",
        errors: Object.values(error.errors).map(
          (fieldError) => fieldError.message,
        ),
      });
    }

    console.error("Recipe creation failed:", error.message);

    return res.status(500).json({
      message: "Unable to create recipe. Please try again.",
    });
  }
}

async function getMyRecipes(req, res) {
  try {
    const recipes = await Recipe.find({
      author: req.user._id,
    }).sort({ createdAt: -1 });

    const enrichedRecipes = await enrichRecipesWithLikes(recipes, req.user._id);

    return res.status(200).json({
      count: recipes.length,
      recipes: enrichedRecipes,
    });
  } catch (error) {
    console.error("Fetching recipes failed:", error.message);

    return res.status(500).json({
      message: "Unable to fetch your recipes.",
    });
  }
}

async function deleteRecipe(req, res) {
  try {
    const { id } = req.params;

    if (!/^[a-fA-F0-9]{24}$/.test(id)) {
      return res.status(400).json({
        message: "Invalid recipe ID.",
      });
    }

    const recipe = await Recipe.findOneAndDelete({
      _id: id,
      author: req.user._id,
    });

    if (!recipe) {
      return res.status(404).json({
        message: "Recipe not found or you cannot delete it.",
      });
    }

    await Comment.deleteMany({ recipe: recipe._id });
    await Like.deleteMany({ recipe: recipe._id });

    return res.status(200).json({
      message: "Recipe deleted successfully.",
    });
  } catch (error) {
    console.error("Delete recipe failed:", error.message);

    return res.status(500).json({
      message: "Unable to delete the recipe. Please try again.",
    });
  }
}

async function updateRecipe(req, res) {
  try {
    const { id } = req.params;

    if (!/^[a-fA-F0-9]{24}$/.test(id)) {
      return res.status(400).json({
        message: "Invalid recipe ID.",
      });
    }

    const recipe = await Recipe.findOne({
      _id: id,
      author: req.user._id,
    });

    if (!recipe) {
      return res.status(404).json({
        message: "Recipe not found or you cannot edit it.",
      });
    }

    const allowedFields = [
      "title",
      "description",
      "ingredients",
      "steps",
      "prepTimeMinutes",
      "cookTimeMinutes",
      "servings",
      "imageUrl",
      "category",
      "equipment",
      "equipmentDeclared",
    ];

    const updates = req.body ?? {};

    if (Object.prototype.hasOwnProperty.call(updates, "equipment") &&
      (!Array.isArray(updates.equipment) || updates.equipment.length > 8 || updates.equipment.some((item) => !EQUIPMENT.includes(item)))) {
      return res.status(400).json({ message: "Recipe equipment is invalid." });
    }

    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(updates, field)) {
        recipe[field] = updates[field];
      }
    }

    if (Object.prototype.hasOwnProperty.call(updates, "status")) {
      if (updates.status !== "published" || recipe.status !== "draft") {
        return res.status(400).json({
          message: "Only drafts can be published; published recipes cannot be unpublished."
        });
      }

      recipe.status = "published";
      recipe.publishedAt = recipe.publishedAt || new Date();
    }

    await recipe.save();

    return res.status(200).json({
      message: "Recipe updated successfully.",
      recipe: (await enrichRecipesWithLikes([recipe], req.user._id))[0],
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({
        message: "Please check your recipe details.",
        errors: Object.values(error.errors).map(
          (fieldError) => fieldError.message,
        ),
      });
    }

    console.error("Recipe update failed:", error.message);

    return res.status(500).json({
      message: "Unable to update recipe. Please try again.",
    });
  }
}

async function getFeed(req, res) {
  try {
    const search = req.query.search ?? "";
    const cursor = req.query.cursor;
    const feed = req.query.feed ?? "discover";
    const category = req.query.category;
    const maxTotalMinutes = req.query.maxTotalMinutes;
    const pageSize = 12;

    if (typeof search !== "string" || search.length > 100) {
      return res.status(400).json({
        message: "Search must be text of 100 characters or fewer.",
      });
    }

    if (
      typeof feed !== "string" ||
      !["discover", "following"].includes(feed)
    ) {
      return res.status(400).json({
        message: "Feed must be either discover or following."
      });
    }

    const filters = [];
    filters.push(PUBLISHED_FILTER);
    const author = req.query.author;

    if (author !== undefined) {
      if (typeof author !== "string" || !/^[a-fA-F0-9]{24}$/.test(author)) {
        return res.status(400).json({
          message: "Invalid author ID.",
        });
      }

      filters.push({ author });
    }

    if (category !== undefined) {
      if (typeof category !== "string" || !["all", ...CATEGORIES].includes(category)) {
        return res.status(400).json({ message: "Invalid category." });
      }

      if (category === "other") {
        filters.push({ $or: [{ category: "other" }, { category: { $exists: false } }] });
      } else if (category !== "all") {
        filters.push({ category });
      }
    }

    if (maxTotalMinutes !== undefined) {
      if (typeof maxTotalMinutes !== "string" || !/^[1-9]\d*$/.test(maxTotalMinutes)) {
        return res.status(400).json({ message: "Maximum time must be a positive whole number." });
      }
      const minutes = Number(maxTotalMinutes);
      if (minutes > 1440) {
        return res.status(400).json({ message: "Maximum time cannot exceed 1440 minutes." });
      }
      filters.push({ $expr: { $lte: [{ $add: ["$prepTimeMinutes", "$cookTimeMinutes"] }, minutes] } });
    }

    if (feed === "following") {
      const followedAuthorIds = await Follow.distinct("following", {
        follower: req.user._id
      });

      // Keep this condition separate from an optional author filter, so an
      // author query cannot return a recipe from someone the user does not follow.
      filters.push({
        author: {
          $in: followedAuthorIds,
          $ne: req.user._id
        }
      });
    }
    const searchTerm = search.trim();

    if (searchTerm) {
      const escapedSearch = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      filters.push({
        title: {
        $regex: escapedSearch,
          $options: "i"
        }
      });
    }

    if (cursor !== undefined) {
      let cursorData;

      try {
        if (typeof cursor !== "string" || cursor.length > 500) {
          throw new Error("Invalid cursor");
        }

        cursorData = JSON.parse(
          Buffer.from(cursor, "base64url").toString("utf8"),
        );

        if (
          !cursorData ||
          typeof cursorData.id !== "string" ||
          !/^[a-fA-F0-9]{24}$/.test(cursorData.id) ||
          typeof cursorData.createdAt !== "string" ||
          Number.isNaN(Date.parse(cursorData.createdAt))
        ) {
          throw new Error("Invalid cursor");
        }
      } catch {
        return res.status(400).json({
          message: "Invalid pagination cursor.",
        });
      }

      const cursorDate = new Date(cursorData.createdAt);

      filters.push({ $or: [
        { createdAt: { $lt: cursorDate } },
        {
          createdAt: cursorDate,
          _id: { $lt: cursorData.id }
        }
      ] });
    }

    const filter = filters.length > 0 ? { $and: filters } : {};

    // Fetch one extra recipe to check whether another page exists.
    const results = await Recipe.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(pageSize + 1)
      .populate("author", "username displayName profilePhotoUrl");

    const hasMore = results.length > pageSize;
    const recipes = results.slice(0, pageSize);

    let nextCursor = null;

    if (hasMore) {
      const lastRecipe = recipes[recipes.length - 1];

      nextCursor = Buffer.from(
        JSON.stringify({
          createdAt: lastRecipe.createdAt.toISOString(),
          id: lastRecipe._id.toString(),
        }),
      ).toString("base64url");
    }

    const enrichedRecipes = await enrichRecipesWithLikes(recipes, req.user._id);

    return res.status(200).json({
      recipes: enrichedRecipes,
      nextCursor,
    });
  } catch (error) {
    console.error("Fetching feed failed:", error.message);

    return res.status(500).json({
      message: "Unable to load the feed.",
    });
  }
}

async function getRecipeById(req, res) {
  try {
    const { id } = req.params;

    if (!/^[a-fA-F0-9]{24}$/.test(id)) {
      return res.status(400).json({
        message: "Invalid recipe ID.",
      });
    }

    const recipe = await Recipe.findById(id).populate(
      "author",
      "username displayName profilePhotoUrl",
    );

    if (!recipe || (!isPublished(recipe) && recipe.author._id.toString() !== req.user._id.toString())) {
      return res.status(404).json({
        message: "Recipe not found.",
      });
    }

    const [enrichedRecipe] = await enrichRecipesWithLikes(
      [recipe],
      req.user._id
    );

    return res.status(200).json({ recipe: enrichedRecipe });
  } catch (error) {
    console.error("Fetching recipe failed:", error.message);

    return res.status(500).json({
      message: "Unable to load the recipe.",
    });
  }
}

module.exports = {
  createRecipe,
  getMyRecipes,
  deleteRecipe,
  updateRecipe,
  getFeed,
  getRecipeById,
};
