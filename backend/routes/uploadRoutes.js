const express = require("express");
const requireAuth = require("../middlewares/requireAuth");
const uploadImage = require("../middlewares/uploadImage");
const {
  uploadRecipeImage,
  uploadProfileImage
} = require("../controllers/uploadController");

const router = express.Router();

router.post(
  "/recipe-image",
  requireAuth,
  uploadImage,
  uploadRecipeImage
);

router.post(
  "/profile-image",
  requireAuth,
  uploadImage,
  uploadProfileImage
);

module.exports = router;
