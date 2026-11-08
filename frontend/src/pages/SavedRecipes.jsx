import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import RecipePreviewCard from "../components/RecipePreviewCard";

export default function SavedRecipes() {
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function fetchSavedRecipes() {
      try {
        const response = await fetch("/api/saved-recipes", {
          credentials: "include",
          signal: controller.signal
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(
            data.message || "Unable to load your saved recipes."
          );
        }

        if (!controller.signal.aborted) {
          setRecipes(data.recipes);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setError(error.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    fetchSavedRecipes();

    return () => controller.abort();
  }, []);

  function handleLikeUpdated(recipeId, updates) {
    setRecipes((previous) =>
      previous.map((recipe) =>
        recipe._id === recipeId ? { ...recipe, ...updates } : recipe
      )
    );
  }

  function handleSaveUpdated(recipeId, updates) {
    setRecipes((previous) =>
      updates.savedByMe
        ? previous.map((recipe) =>
          recipe._id === recipeId ? { ...recipe, ...updates } : recipe
        )
        : previous.filter((recipe) => recipe._id !== recipeId)
    );
  }

  return (
    <main className="main-content">
      <section className="welcome">
        <div>
          <p className="eyebrow">YOUR PERSONAL COOKBOOK</p>
          <h1>Saved Recipes</h1>
          <p>Recipes you want to come back to and cook.</p>
        </div>

        <Link className="primary-button" to="/">
          Discover recipes
        </Link>
      </section>

      {loading && <div role="status" className="culinary-loading-grid" aria-label="Loading saved recipes">{[0, 1, 2].map((item) => <div className="culinary-skeleton-card" key={item} />)}</div>}

      {error && <p role="alert">{error}</p>}

      {!loading && !error && recipes.length === 0 && (
        <div className="empty-state">
          <h2>Your cookbook is waiting.</h2>
          <p>
            Open a recipe and click “Save recipe” to add it here.
          </p>
          <Link to="/">Explore recipes</Link>
        </div>
      )}

      {!loading && !error && recipes.length > 0 && (
        <div className="recipe-list culinary-recipe-grid">
          {recipes.map((recipe) => (
            <RecipePreviewCard key={recipe._id} recipe={recipe}
              onLikeUpdated={handleLikeUpdated} onSaveUpdated={handleSaveUpdated} />
          ))}
        </div>
      )}
    </main>
  );
}
