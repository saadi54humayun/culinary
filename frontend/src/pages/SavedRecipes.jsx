import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import RecipeLikeButton from "../components/RecipeLikeButton";
import RecipeSaveButton from "../components/RecipeSaveButton";

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

      {loading && <p role="status">Loading saved recipes…</p>}

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
        <div className="recipe-list">
          {recipes.map((recipe) => (
            <article className="recipe-card" key={recipe._id}>
              <Link
                className="recipe-photo-link"
                to={`/recipes/${recipe._id}`}
                aria-label={`View ${recipe.title}`}
              >
                {recipe.imageUrl ? (
                  <img
                    className="recipe-card-photo"
                    src={recipe.imageUrl}
                    alt={recipe.title}
                    loading="lazy"
                  />
                ) : (
                  <div className="recipe-photo-placeholder">
                    <span aria-hidden="true">🍲</span>
                    <span>No photo yet</span>
                  </div>
                )}
              </Link>

              <h3>
                <Link to={`/recipes/${recipe._id}`}>
                  {recipe.title}
                </Link>
              </h3>

              <div className="recipe-card-meta-row">
                <p className="recipe-author">
                  By{" "}
                  {recipe.author?.username ? (
                    <Link
                      to={`/users/${encodeURIComponent(recipe.author.username)}`}
                    >
                      {recipe.author.displayName || recipe.author.username}
                    </Link>
                  ) : (
                    "Unknown author"
                  )}
                </p>
                <div className="recipe-card-actions">
                  <RecipeLikeButton
                    recipe={recipe}
                    onLikeUpdated={handleLikeUpdated}
                  />
                  <RecipeSaveButton
                    recipe={recipe}
                    onSaveUpdated={handleSaveUpdated}
                  />
                </div>
              </div>

              <p>{recipe.description}</p>

              <p>
                Prep: {recipe.prepTimeMinutes} minutes · Cook:{" "}
                {recipe.cookTimeMinutes} minutes
              </p>

              <p>Servings: {recipe.servings}</p>

            </article>
          ))}
        </div>
      )}
    </main>
  );
}
