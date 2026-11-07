import { useEffect, useState } from "react";
import RecipeForm from "../components/recipeForm";
import RecipeLikeButton from "../components/RecipeLikeButton";
import RecipeSaveButton from "../components/RecipeSaveButton";
import { Link, useLocation, useNavigate } from "react-router-dom";


export default function Dashboard() {
    const location = useLocation();
    const navigate = useNavigate();
    const startsWithCreateIntent = new URLSearchParams(location.search).get("create") === "1";

    const [recipes, setRecipes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [showRecipeForm, setShowRecipeForm] = useState(startsWithCreateIntent);
    const [deletingId, setDeletingId] = useState(null);
    const [deleteError, setDeleteError] = useState("");
    const [editingRecipe, setEditingRecipe] = useState(null);
    const [recipeView, setRecipeView] = useState("published");

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        if (params.get("create") !== "1") return;

        // The form's initial state consumes this intent. Remove it right away
        // so a refresh or later visit cannot replay creation.
        params.delete("create");
        navigate({ pathname: "/my-recipes", search: params.toString() ? `?${params.toString()}` : "" }, { replace: true });
    }, [location.search, navigate]);

    const visibleRecipes = recipes.filter((recipe) =>
        recipeView === "drafts" ? recipe.status === "draft" : recipe.status !== "draft"
    );

    useEffect(() => {
        const controller = new AbortController();

        async function fetchRecipes() {
            try {
                const response = await fetch("/api/recipes/mine", {
                    credentials: "include",
                    signal: controller.signal
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.message || "Unable to load your recipes.");
                }

                setRecipes(data.recipes);
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

        fetchRecipes();


        return () => controller.abort();
    }, []);

    function handleRecipeCreated(newRecipe) {
        setRecipes((previous) => [newRecipe, ...previous]);
        setShowRecipeForm(false);
    }


    async function handleDeleteRecipe(recipeId) {
        const confirmed = window.confirm(
            "Delete this recipe? This cannot be undone."
        );

        if (!confirmed) return;

        setDeletingId(recipeId);
        setDeleteError("");

        try {
            const response = await fetch(`/api/recipes/${recipeId}`, {
                method: "DELETE",
                credentials: "include"
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || "Unable to delete the recipe.");
            }

            setRecipes((previous) =>
                previous.filter((recipe) => recipe._id !== recipeId)
            );
        } catch (error) {
            setDeleteError(error.message);
        } finally {
            setDeletingId(null);
        }
    }

    function handleRecipeUpdated(updatedRecipe) {
        setRecipes((previous) =>
            previous.map((recipe) =>
                recipe._id === updatedRecipe._id ? updatedRecipe : recipe
            )
        );

        setEditingRecipe(null);
        setShowRecipeForm(false);
    }

    function handleLikeUpdated(recipeId, updates) {
        setRecipes((previous) =>
            previous.map((recipe) =>
                recipe._id === recipeId ? { ...recipe, ...updates } : recipe
            )
        );
    }

    function handleSaveUpdated(recipeId, updates) {
        setRecipes((previous) =>
            previous.map((recipe) =>
                recipe._id === recipeId ? { ...recipe, ...updates } : recipe
            )
        );
    }

    return (
        <div className="dashboard">

            <main className="main-content">

                <section className="welcome">
                    <div>
                        <p className="eyebrow">YOUR COOKING COMMUNITY</p>
                        <h1>Something delicious starts here.</h1>
                        <p>Share your recipes and keep your favourites close.</p>
                    </div>

                </section>

                {showRecipeForm && (
                    <RecipeForm
                        key={editingRecipe?._id ?? "new"}
                        initialRecipe={editingRecipe}
                        onCreated={handleRecipeCreated}
                        onUpdated={handleRecipeUpdated}
                        onCancel={() => {
                            setShowRecipeForm(false);
                            setEditingRecipe(null);
                        }}
                    />
                )}


                <section className="feed">
                    <div className="dashboard-recipe-heading">
                        <div>
                            <h2>My Recipes</h2>
                            {recipeView === "drafts" && <p>Drafts are private until you publish them.</p>}
                        </div>
                        <div className="feed-tabs" role="group" aria-label="My recipe status">
                            <button className={recipeView === "published" ? "feed-tab active" : "feed-tab"} type="button" onClick={() => setRecipeView("published")}>Published</button>
                            <button className={recipeView === "drafts" ? "feed-tab active" : "feed-tab"} type="button" onClick={() => setRecipeView("drafts")}>Drafts</button>
                        </div>
                    </div>
                    {deleteError && <p role="alert">{deleteError}</p>}

                    {loading && <p>Loading your recipes…</p>}

                    {error && <p role="alert">{error}</p>}

                    {!loading && !error && (
                        visibleRecipes.length === 0 ? (
                            <p>{recipeView === "drafts" ? "You have no private drafts yet." : "You haven’t published any recipes yet."}</p>
                        ) : (
                            <div className="recipe-list">
                                {visibleRecipes.map((recipe) => (


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
                                            <p className="recipe-author">By you</p>
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

                                        <p className="recipe-category-badge">{recipe.category || "other"}</p>

                                        <p>
                                            Prep: {recipe.prepTimeMinutes} minutes ·
                                            Cook: {recipe.cookTimeMinutes} minutes
                                        </p>

                                        <p>Servings: {recipe.servings}</p>

                                        <button
                                            type="button"
                                            onClick={() => {
                                                setEditingRecipe(recipe);
                                                setShowRecipeForm(true);
                                            }}
                                        >
                                            Edit recipe
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => handleDeleteRecipe(recipe._id)}
                                            disabled={deletingId !== null}
                                        >
                                            {deletingId === recipe._id ? "Deleting…" : "Delete recipe"}
                                        </button>
                                    </article>
                                ))}
                            </div>
                        )
                    )}
                </section>
            </main>
        </div>
    );
}
