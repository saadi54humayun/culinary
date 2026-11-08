import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import RecipeComments from "../components/RecipeComments";
import RecipeLikeButton from "../components/RecipeLikeButton";
import NutritionFacts from "../components/NutritionFacts";
import { downloadOfflineRecipe, getOfflineRecipe, removeOfflineRecipe } from "../offline/storage";

export default function RecipeDetails({ user }) {
    const { id } = useParams();

    const [recipe, setRecipe] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [saved, setSaved] = useState(false);
    const [checkingSaved, setCheckingSaved] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savedError, setSavedError] = useState("");
    const [nutrition, setNutrition] = useState(null);
    const [nutritionLoading, setNutritionLoading] = useState(false);
    const [nutritionError, setNutritionError] = useState("");
    const [downloaded, setDownloaded] = useState(false);
    const [offlineBusy, setOfflineBusy] = useState(false);
    const [offlineMessage, setOfflineMessage] = useState("");

    useEffect(() => {
        const controller = new AbortController();

        async function fetchRecipe() {
            setLoading(true);
            setError("");
            setRecipe(null);
            setNutrition(null);
            setNutritionError("");

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
                    setNutrition(data.recipe.nutrition ?? null);
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

    useEffect(() => {
        if (!recipe?._id || !user) return;
        let active = true;
        getOfflineRecipe(user.id || user._id, recipe._id).then((item) => {
            if (active) setDownloaded(Boolean(item));
        }).catch(() => { if (active) setDownloaded(false); });
        return () => { active = false; };
    }, [recipe?._id, user]);

    async function toggleOfflineDownload() {
        if (!recipe || !user || offlineBusy) return;
        setOfflineBusy(true);
        setOfflineMessage("");
        try {
            if (downloaded) {
                await removeOfflineRecipe(user.id || user._id, recipe._id);
                setDownloaded(false);
                setOfflineMessage("Offline download removed.");
            } else {
                // The revision is needed to safely sync edits after the user reconnects.
                const res = await fetch(`/api/recipes/${recipe._id}/cook-progress`, { credentials: "include" });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.message || "Unable to prepare this recipe for offline use.");
                const result = await downloadOfflineRecipe(user.id || user._id, recipe, data.recipeVersion, data.progress, data.updatedAt);
                setDownloaded(true);
                setOfflineMessage(result.imageCached ? "Recipe and photo saved on this device." : "Recipe saved. Photo may need internet.");
            }
        } catch (error) { setOfflineMessage(error.message); }
        finally { setOfflineBusy(false); }
    }

    // Calculate once on first visit; subsequent visits reuse the cached Recipe.nutrition.
    useEffect(() => {
        if (!recipe?._id || nutrition?.status) return;
        const controller = new AbortController();
        async function analyze() {
            setNutritionLoading(true);
            setNutritionError("");
            try {
                const response = await fetch(`/api/recipes/${recipe._id}/nutrition/analyze`, {
                    method: "POST", credentials: "include", signal: controller.signal
                });
                const data = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(data.message || "Unable to analyze nutrition.");
                if (!controller.signal.aborted) setNutrition(data.nutrition);
            } catch (error) {
                if (!controller.signal.aborted) setNutritionError(error.message);
            } finally {
                if (!controller.signal.aborted) setNutritionLoading(false);
            }
        }
        analyze();
        return () => controller.abort();
    }, [recipe?._id, nutrition?.status]);

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

                    {recipe.steps?.length > 0 && (
                        <Link className="primary-button" to={`/recipes/${recipe._id}/cook`}>
                            Start cooking →
                        </Link>
                    )}

                    {recipe.status !== "draft" && recipe.steps?.length > 0 && <div className="offline-download-actions" style={{ margin: "16px 0" }}>
                        <button type="button" onClick={toggleOfflineDownload} disabled={offlineBusy}>
                            {offlineBusy ? "Preparing download…" : downloaded ? "Remove offline download" : "↓ Save for offline cooking"}
                        </button>
                        {downloaded && <Link to="/offline-recipes" style={{ marginLeft: 12 }}>My offline recipes</Link>}
                        {offlineMessage && <p role="status">{offlineMessage}</p>}
                    </div>}
                    <NutritionFacts nutrition={nutrition} loading={nutritionLoading} error={nutritionError} />

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
