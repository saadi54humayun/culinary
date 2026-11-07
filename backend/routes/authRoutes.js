const express = require("express");
const {
  signup,
  login,
  getMe,
  logout,
  updateProfile,
  resendVerification,
  verifySignupOtp,
  requestPasswordReset,
  verifyPasswordResetOtp,
  resetPassword
} = require("../controllers/authController");

const requireAuth = require("../middlewares/requireAuth");

const router = express.Router();

router.post("/signup", signup);
router.post("/login", login);
router.post("/verify-email", verifySignupOtp);
router.post("/verify-email/resend", resendVerification);
router.post("/password-reset/request", requestPasswordReset);
router.post("/password-reset/verify", verifyPasswordResetOtp);
router.post("/password-reset/complete", resetPassword);
router.get("/me", requireAuth, getMe);
router.post("/logout", logout);
router.patch("/profile", requireAuth, updateProfile);

module.exports = router;
