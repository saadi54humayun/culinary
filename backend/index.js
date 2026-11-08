require("dotenv").config();
const { createSessionMiddleware } = require("./config/session");
const authRoutes = require("./routes/authRoutes");
const express = require("express");
const connectDB = require("./config/db");
const recipeRoutes = require("./routes/recipeRoutes");
const commentRoutes = require("./routes/commentRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const savedRecipeRoutes = require("./routes/savedRecipeRoutes");
const userRoutes = require("./routes/userRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const aiChatRoutes = require("./routes/aiChatRoutes");
const mealPlanRoutes = require("./routes/mealPlanRoutes");
const pantryRoutes = require("./routes/pantryRoutes");

const app = express();
const PORT = Number(process.env.PORT) || 5000;

app.disable("x-powered-by");
// Vercel forwards HTTPS to Express. Trust its proxy so secure session cookies
// (and password-reset cookies) work correctly behind the platform.
if (process.env.VERCEL) app.set("trust proxy", 1);

app.use(express.json());
// All Culinary API routes are personalized; never cache responses in a CDN.
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "private, no-store");
  next();
});

// On Vercel there is no one-time startup callback. Ensure MongoDB is ready
// before session lookup or any route executes, per incoming request.
app.use((req, res, next) => {
  connectDB().then(() => next()).catch((error) => {
    console.error("Database connection failed:", error.message);
    res.status(503).json({ message: "Database temporarily unavailable." });
  });
});

app.use(createSessionMiddleware());
app.use("/api/saved-recipes", savedRecipeRoutes);
app.use("/api/meal-plans", mealPlanRoutes);
app.use("/api/pantry", pantryRoutes);
app.use("/api/users", userRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/ai-chat", aiChatRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/recipes", commentRoutes);
app.use("/api/recipes", recipeRoutes);

app.get("/", (_, res) => {
  res.json({ message: "Welcome to Culinary!" });
});

app.get("/api/health", (_, res) => {
  res.json({ status: "ok", app: "Culinary" });
});

// Vercel imports this CommonJS export as its Express function. Only bind a
// listening socket when this file is launched directly for local development.
if (require.main === module && !process.env.VERCEL) {
  connectDB().then(() => {
    app.listen(PORT, () => {
      console.log(`Culinary backend running at http://localhost:${PORT}`);
    });
  }).catch((error) => {
    console.error("Database startup failed:", error.message);
    process.exitCode = 1;
  });
}

module.exports = app;
