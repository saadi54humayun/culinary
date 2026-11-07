const mongoose = require("mongoose");
const notificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type: { type: String, enum: ["follow", "like", "comment"], required: true },
  recipe: { type: mongoose.Schema.Types.ObjectId, ref: "Recipe" },
  comment: { type: mongoose.Schema.Types.ObjectId, ref: "Comment" },
  eventKey: { type: String, required: true, unique: true },
  readAt: { type: Date, default: null }
}, { timestamps: true });
notificationSchema.index({ recipient: 1, createdAt: -1, _id: -1 });
notificationSchema.index({ recipient: 1, readAt: 1 });
module.exports = mongoose.model("Notification", notificationSchema);
