import { useEffect, useState } from "react";
import RecipeForm from "../components/recipeForm";
import RecipePreviewCard from "../components/RecipePreviewCard";
import { useLocation, useNavigate } from "react-router-dom";


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
                    <button className="primary-button" type="button" onClick={() => { setEditingRecipe(null); setShowRecipeForm(true); }}>
                        + Create recipe
                    </button>
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

                    {loading && <div role="status" className="culinary-loading-grid" aria-label="Loading recipes">{[0, 1, 2].map((item) => <div className="culinary-skeleton-card" key={item} />)}</div>}

                    {error && <p role="alert">{error}</p>}

                    {!loading && !error && (
                        visibleRecipes.length === 0 ? (
                            <div className="empty-state culinary-empty-recipe-state">
                                <h3>{recipeView === "drafts" ? "No drafts yet" : "Your cookbook starts here"}</h3>
                                <p>{recipeView === "drafts" ? "Create a recipe and save it as a draft to finish later." : "Share your first recipe with the Culinary community."}</p>
                                <button type="button" className="primary-button" onClick={() => { setEditingRecipe(null); setShowRecipeForm(true); }}>
                                    + Create your first recipe
                                </button>
                            </div>
                        ) : (
                            <div className="recipe-list culinary-recipe-grid">
                                {visibleRecipes.map((recipe) => (
                                    <RecipePreviewCard key={recipe._id} recipe={recipe} owner
                                        onLikeUpdated={handleLikeUpdated} onSaveUpdated={handleSaveUpdated}
                                        onEdit={(item) => { setEditingRecipe(item); setShowRecipeForm(true); }}
                                        onDelete={handleDeleteRecipe} deleting={deletingId === recipe._id} />
                                ))}
                            </div>
                        )
                    )}
                </section>
            </main>
        </div>
    );
}
