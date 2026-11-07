const express = require("express");
const requireAuth = require("../middlewares/requireAuth");
const {
  getPublicProfile,
  followUser,
  unfollowUser,
  searchUsers,
  listConnections
} = require("../controllers/userController");

const router = express.Router();
router.get("/search", requireAuth, searchUsers);
router.get("/:username/:type", requireAuth, listConnections);

router.get("/:username", requireAuth, getPublicProfile);
router.put("/:username/follow", requireAuth, followUser);
router.delete("/:username/follow", requireAuth, unfollowUser);

module.exports = router;
