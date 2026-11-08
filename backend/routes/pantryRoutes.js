const express = require("express");
const requireAuth = require("../middlewares/requireAuth");
const { listPantry, addPantryItem, updatePantryItem, deletePantryItem, matchPantryRecipes } = require("../controllers/pantryController");

const router = express.Router();
router.use(requireAuth);
router.get("/recipes", matchPantryRecipes);
router.get("/", listPantry);
router.post("/", addPantryItem);
router.put("/:id", updatePantryItem);
router.delete("/:id", deletePantryItem);
module.exports = router;
