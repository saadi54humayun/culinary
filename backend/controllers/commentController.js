const Comment = require("../models/Comment");
const Recipe = require("../models/Recipe");
const { createNotification, removeNotification } = require("../utils/notifications");

const PAGE_SIZE = 10;
const PUBLIC_AUTHOR_FIELDS = "username displayName profilePhotoUrl";

function isValidId(id) {
  return /^[a-fA-F0-9]{24}$/.test(id);
}

function serializeComment(comment) {
  const author = comment.author;

  return {
    _id: comment._id,
    recipe: comment.recipe,
    text: comment.text,
    createdAt: comment.createdAt,
    author: author
      ? {
          _id: author._id,
          username: author.username,
          displayName: author.displayName,
          profilePhotoUrl: author.profilePhotoUrl
        }
      : null
  };
}

function getCursor(cursor) {
  try {
    if (typeof cursor !== "string" || cursor.length > 500) {
      throw new Error("Invalid cursor");
    }

    const cursorData = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8")
    );

    if (
      !cursorData ||
      typeof cursorData.id !== "string" ||
      !isValidId(cursorData.id) ||
      typeof cursorData.createdAt !== "string" ||
      Number.isNaN(Date.parse(cursorData.createdAt))
    ) {
      throw new Error("Invalid cursor");
    }

    return cursorData;
  } catch {
    return null;
  }
}

async function recipeExists(recipeId) {
  return Recipe.exists({
    _id: recipeId,
    $or: [{ status: "published" }, { status: { $exists: false } }]
  });
}

async function getComments(req, res) {
  try {
    const { recipeId } = req.params;

    if (!isValidId(recipeId)) {
      return res.status(400).json({ message: "Invalid recipe ID." });
    }

    const exists = await recipeExists(recipeId);

    if (!exists) {
      return res.status(404).json({ message: "Recipe not found." });
    }

    const filter = { recipe: recipeId };
    const cursor = req.query.cursor;

    if (cursor !== undefined) {
      const cursorData = getCursor(cursor);

      if (!cursorData) {
        return res.status(400).json({
          message: "Invalid pagination cursor."
        });
      }

      const cursorDate = new Date(cursorData.createdAt);

      filter.$or = [
        { createdAt: { $lt: cursorDate } },
        { createdAt: cursorDate, _id: { $lt: cursorData.id } }
      ];
    }

    const results = await Comment.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(PAGE_SIZE + 1)
      .populate("author", PUBLIC_AUTHOR_FIELDS)
      .lean();

    const hasMore = results.length > PAGE_SIZE;
    const comments = results.slice(0, PAGE_SIZE);
    const lastComment = comments[comments.length - 1];
    const nextCursor = hasMore
      ? Buffer.from(
          JSON.stringify({
            createdAt: lastComment.createdAt.toISOString(),
            id: lastComment._id.toString()
          })
        ).toString("base64url")
      : null;

    return res.status(200).json({
      comments: comments.map(serializeComment),
      nextCursor
    });
  } catch (error) {
    console.error("Fetching comments failed:", error.message);

    return res.status(500).json({
      message: "Unable to load comments."
    });
  }
}

async function createComment(req, res) {
  try {
    const { recipeId } = req.params;
    const { text } = req.body ?? {};

    if (!isValidId(recipeId)) {
      return res.status(400).json({ message: "Invalid recipe ID." });
    }

    if (typeof text !== "string") {
      return res.status(400).json({ message: "Comment text must be text." });
    }

    const trimmedText = text.trim();

    if (trimmedText.length < 1 || trimmedText.length > 1000) {
      return res.status(400).json({
        message: "Comment text must be between 1 and 1000 characters."
      });
    }

    const exists = await recipeExists(recipeId);

    if (!exists) {
      return res.status(404).json({ message: "Recipe not found." });
    }

    const comment = await Comment.create({
      recipe: recipeId,
      author: req.user._id,
      text: trimmedText
    });
    const recipe = await Recipe.findById(recipeId).select("author");
    await createNotification({ recipient: recipe.author, actor: req.user._id, type: "comment", recipe: recipeId, comment: comment._id, eventKey: `comment:${comment._id}` });

    await comment.populate("author", PUBLIC_AUTHOR_FIELDS);

    return res.status(201).json({
      message: "Comment posted successfully.",
      comment: serializeComment(comment)
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({
        message: "Please check your comment and try again."
      });
    }

    console.error("Creating comment failed:", error.message);

    return res.status(500).json({
      message: "Unable to post your comment. Please try again."
    });
  }
}

async function deleteComment(req, res) {
  try {
    const { recipeId, commentId } = req.params;

    if (!isValidId(recipeId)) {
      return res.status(400).json({ message: "Invalid recipe ID." });
    }

    if (!isValidId(commentId)) {
      return res.status(400).json({ message: "Invalid comment ID." });
    }

    const comment = await Comment.findOneAndDelete({
      _id: commentId,
      recipe: recipeId,
      author: req.user._id
    });

    if (!comment) {
      return res.status(404).json({
        message: "Comment not found or you cannot delete it."
      });
    }
    await removeNotification(`comment:${comment._id}`);

    return res.status(200).json({ message: "Comment deleted successfully." });
  } catch (error) {
    console.error("Deleting comment failed:", error.message);

    return res.status(500).json({
      message: "Unable to delete this comment. Please try again."
    });
  }
}

module.exports = { getComments, createComment, deleteComment };
