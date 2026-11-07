import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import RecipeComments from "../components/RecipeComments";
import RecipeLikeButton from "../components/RecipeLikeButton";

export default function RecipeDetails({ user }) {
    const { id } = useParams();

    const [recipe, setRecipe] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [saved, setSaved] = useState(false);
    const [checkingSaved, setCheckingSaved] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savedError, setSavedError] = useState("");

    useEffect(() => {
        const controller = new AbortController();

        async function fetchRecipe() {
            setLoading(true);
            setError("");
            setRecipe(null);

            try {
                const response = await fetch(`/api/recipes/${id}`, {
                    credentials: "include",
                    signal: controller.signal
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(
                        data.message || "Unable to load the recipe."
                    );
                }

                if (!controller.signal.aborted) {
                    setRecipe(data.recipe);
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

        fetchRecipe();

        return () => controller.abort();
    }, [id]);

    useEffect(() => {
        const controller = new AbortController();

        async function checkSavedStatus() {
            setCheckingSaved(true);
            setSaved(false);
            setSavedError("");

            try {
                const response = await fetch(`/api/saved-recipes/${id}`, {
                    credentials: "include",
                    signal: controller.signal
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(
                        data.message || "Unable to check saved status."
                    );
                }

                if (!controller.signal.aborted) {
                    setSaved(data.saved);
                }
            } catch (error) {
                if (!controller.signal.aborted) {
                    setSavedError(error.message);
                }
            } finally {
                if (!controller.signal.aborted) {
                    setCheckingSaved(false);
                }
            }
        }

        checkSavedStatus();

        return () => controller.abort();
    }, [id]);

    async function handleToggleSaved() {
        if (saving || checkingSaved) return;

        setSaving(true);
        setSavedError("");

        try {
            const response = await fetch(`/api/saved-recipes/${id}`, {
                method: saved ? "DELETE" : "PUT",
                credentials: "include"
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    data.message || "Unable to update your saved recipes."
                );
            }

            setSaved(data.saved);
        } catch (error) {
            setSavedError(error.message);
        } finally {
            setSaving(false);
        }
    }

    function handleLikeUpdated(recipeId, updates) {
        setRecipe((previous) =>
            previous && previous._id === recipeId
                ? { ...previous, ...updates }
                : previous
        );
    }

    return (
        <main className="main-content">
            <Link to="/">← Back to feed</Link>

            {loading && <p>Loading recipe…</p>}
            {error && <p role="alert">{error}</p>}

            {!loading && !error && recipe && (
                <article className="recipe-detail-card">
                    {recipe.imageUrl && (
                        <img
                            className="recipe-detail-photo"
                            src={recipe.imageUrl}
                            alt={recipe.title}
                        />
                    )}
                    <h1>{recipe.title}</h1>

                    <p>
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
                    <div className="recipe-action-row">
                        <div className="recipe-save-actions">
                            <button
                                type="button"
                                className="primary-button"
                                onClick={handleToggleSaved}
                                disabled={checkingSaved || saving}
                            >
                                {checkingSaved
                                    ? "Checking saved status…"
                                    : saving
                                        ? "Updating…"
                                        : saved
                                            ? "Unsave recipe"
                                            : "Save recipe"}
                            </button>

                            {!checkingSaved && saved && (
                                <p role="status">This recipe is in your saved collection.</p>
                            )}

                            {savedError && <p role="alert">{savedError}</p>}
                        </div>

                        <RecipeLikeButton
                            key={recipe._id}
                            recipe={recipe}
                            onLikeUpdated={handleLikeUpdated}
                        />
                    </div>

                    <p>{recipe.description}</p>

                    <p>
                        Prep: {recipe.prepTimeMinutes} minutes ·
                        Cook: {recipe.cookTimeMinutes} minutes
                    </p>

                    <p>Servings: {recipe.servings}</p>

                    <h2>Ingredients</h2>
                    <ul>
                        {recipe.ingredients.map((ingredient, index) => (
                            <li key={index}>
                                {[
                                    ingredient.quantity,
                                    ingredient.unit,
                                    ingredient.name
                                ].filter(Boolean).join(" ")}
                            </li>
                        ))}
                    </ul>

                    <h2>Cooking steps</h2>
                    <ol>
                        {recipe.steps.map((step, index) => (
                            <li key={index}>{step}</li>
                        ))}
                    </ol>

                    <RecipeComments
                        key={id}
                        recipeId={id}
                        currentUserId={user.id}
                    />
                </article>
            )}
        </main>
    );
}
