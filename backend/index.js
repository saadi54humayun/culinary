require("dotenv").config();
const {createSessionMiddleware} = require("./config/session");
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

app.use(express.json());
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
  res.json({
    status: "ok",
    app: "Culinary"
  });
});


async function startServer() {
  try {
    await connectDB();

    app.listen(PORT, () => {
      console.log(
        `Culinary backend running at http://localhost:${PORT}`
      );
    });
  } catch (error) {
    console.error("Database startup failed:", error.message);
    process.exit(1);
  }
}

startServer();
