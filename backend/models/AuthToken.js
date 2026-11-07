const mongoose = require("mongoose");

const authTokenSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  purpose: { type: String, enum: ["password-reset", "email-verification", "password-reset-grant"], required: true },
  // Opaque random id exposed to the browser. It is never sufficient on its own.
  challengeId: { type: String, unique: true, sparse: true, index: true },
  // HMAC for OTP challenges or SHA-256 hash for reset grants.
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  consumedAt: { type: Date, default: null },
  failedAttempts: { type: Number, default: 0, min: 0 },
  lastSentAt: { type: Date, default: null },
  sendCount: { type: Number, default: 1, min: 0 }
}, { timestamps: true });

authTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
authTokenSchema.index({ user: 1, purpose: 1, createdAt: -1 });
module.exports = mongoose.model("AuthToken", authTokenSchema);
