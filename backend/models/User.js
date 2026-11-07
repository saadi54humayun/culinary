const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },

    passwordHash: {
      type: String,
      required: true,
      select: false
    },

    displayName: {
      type: String,
      trim: true,
      default: ""
    },

    bio: {
      type: String,
      maxlength: 300,
      default: ""
    },

    profilePhotoUrl: {
      type: String,
      default: ""
    },

    emailVerifiedAt: {
      type: Date,
      default: null
    },

    // Explicit rollout boundary: records created before this feature retain
    // access, while new signups set this true and must verify their email.
    verificationRequired: {
      type: Boolean,
      default: false
    },

    sessionVersion: {
      type: Number,
      default: 0
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
