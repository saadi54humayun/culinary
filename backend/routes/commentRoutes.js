const express = require("express");
const requireAuth = require("../middlewares/requireAuth");
const {
  getComments,
  createComment,
  deleteComment
} = require("../controllers/commentController");

const router = express.Router();

router.get("/:recipeId/comments", requireAuth, getComments);
router.post("/:recipeId/comments", requireAuth, createComment);
router.delete(
  "/:recipeId/comments/:commentId",
  requireAuth,
  deleteComment
);

module.exports = router;
