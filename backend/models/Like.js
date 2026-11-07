const mongoose = require("mongoose");

const likeSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    recipe: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Recipe",
      required: true
    }
  },
  { timestamps: true }
);

likeSchema.index({ user: 1, recipe: 1 }, { unique: true });
likeSchema.index({ recipe: 1 });

module.exports = mongoose.model("Like", likeSchema);
