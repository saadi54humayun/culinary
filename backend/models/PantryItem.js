const mongoose = require("mongoose");
const { validatePantryInput, normalizePantryInput } = require("../utils/pantry");

const pantryItemSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  normalizedName: { type: String, required: true },
  quantity: { type: Number, required: true, min: 0.001, max: 1000000 },
  unit: { type: String, default: "" },
  family: { type: String, required: true },
  category: { type: String, required: true }
}, { timestamps: true });

pantryItemSchema.index({ user: 1, normalizedName: 1, family: 1 }, { unique: true });

pantryItemSchema.statics.validatedFields = function validatedFields(body) {
  const error = validatePantryInput(body);
  if (error) return { error };
  return { data: normalizePantryInput(body) };
};

module.exports = mongoose.model("PantryItem", pantryItemSchema);
