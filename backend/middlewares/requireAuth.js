const User = require("../models/User");

async function requireAuth(req, res, next) {
  try {
    if (!req.session?.userId) {
      return res.status(401).json({
        message: "Please log in."
      });
    }

    const user = await User.findById(req.session.userId)
      .select("_id username email displayName bio profilePhotoUrl sessionVersion");

    if (!user) {
      return res.status(401).json({
        message: "Account no longer exists. Please log in again."
      });
    }

    // Sessions from before sessionVersion enforcement are deliberately
    // rejected so password resets invalidate every existing session.
    if (!Number.isInteger(req.session.userVersion) || req.session.userVersion !== user.sessionVersion) {
      req.session.destroy(() => {});
      return res.status(401).json({ message: "Your session expired. Please log in again." });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Authentication failed:", error.message);

    return res.status(500).json({
      message: "Unable to verify your session."
    });
  }
}

module.exports = requireAuth;
