const PantryItem = require("../models/PantryItem");
const Recipe = require("../models/Recipe");
const { compareRecipeToPantry } = require("../utils/pantry");

const published = { $or: [{ status: "published" }, { status: { $exists: false } }] };

function handleError(error, res, action) {
  if (error.code === 11000) {
    return res.status(409).json({ message: "That ingredient and unit type already exist. Edit the existing pantry item instead." });
  }
  console.error(`Pantry ${action} failed:`, error.message);
  return res.status(500).json({ message: `Unable to ${action} pantry items.` });
}

async function listPantry(req, res) {
  try {
    const items = await PantryItem.find({ user: req.user._id }).sort({ name: 1, _id: 1 }).lean();
    return res.json({ items });
  } catch (error) { return handleError(error, res, "load"); }
}

async function addPantryItem(req, res) {
  const { error, data } = PantryItem.validatedFields(req.body);
  if (error) return res.status(400).json({ message: error });
  try {
    const item = await PantryItem.create({ user: req.user._id, ...data });
    return res.status(201).json({ item });
  } catch (err) { return handleError(err, res, "add"); }
}

async function updatePantryItem(req, res) {
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ message: "Invalid pantry item ID." });
  const { error, data } = PantryItem.validatedFields(req.body);
  if (error) return res.status(400).json({ message: error });
  try {
    const item = await PantryItem.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { $set: data }, { new: true, runValidators: true }
    );
    if (!item) return res.status(404).json({ message: "Pantry item not found." });
    return res.json({ item });
  } catch (err) { return handleError(err, res, "update"); }
}

async function deletePantryItem(req, res) {
  if (!/^[a-f\d]{24}$/i.test(req.params.id)) return res.status(400).json({ message: "Invalid pantry item ID." });
  try {
    const result = await PantryItem.deleteOne({ _id: req.params.id, user: req.user._id });
    if (!result.deletedCount) return res.status(404).json({ message: "Pantry item not found." });
    return res.json({ message: "Ingredient removed from pantry." });
  } catch (err) { return handleError(err, res, "remove"); }
}

async function matchPantryRecipes(req, res) {
  const search = req.query.search ?? "";
  const category = req.query.category ?? "all";
  if (typeof search !== "string" || search.length > 80 || typeof category !== "string" || category.length > 30) {
    return res.status(400).json({ message: "Invalid recipe filters." });
  }
  if (!["all", "breakfast", "lunch", "dinner", "snack", "dessert", "drink", "other"].includes(category)) {
    return res.status(400).json({ message: "Invalid recipe category." });
  }
  try {
    const filters = [published];
    if (category !== "all") filters.push({ category });
    if (search.trim()) {
      const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(escaped, "i");
      filters.push({ $or: [{ title: pattern }, { "ingredients.name": pattern }] });
    }
    const [items, recipes] = await Promise.all([
      PantryItem.find({ user: req.user._id }).lean(),
      Recipe.find({ $and: filters }).select("title category imageUrl servings ingredients prepTimeMinutes cookTimeMinutes")
        .sort({ createdAt: -1, _id: -1 }).limit(200).lean()
    ]);
    const matches = recipes.map((recipe) => ({
      recipe: { _id: recipe._id, title: recipe.title, category: recipe.category, imageUrl: recipe.imageUrl,
        servings: recipe.servings, prepTimeMinutes: recipe.prepTimeMinutes, cookTimeMinutes: recipe.cookTimeMinutes },
      ...compareRecipeToPantry(recipe, items)
    }));
    matches.sort((a, b) => a.missing.length - b.missing.length || a.uncertain.length - b.uncertain.length ||
      b.matchedCount - a.matchedCount || a.recipe.title.localeCompare(b.recipe.title));
    return res.json({ matches: matches.slice(0, 24), examined: recipes.length, limited: recipes.length === 200 });
  } catch (error) { return handleError(error, res, "match"); }
}

module.exports = { listPantry, addPantryItem, updatePantryItem, deletePantryItem, matchPantryRecipes };
