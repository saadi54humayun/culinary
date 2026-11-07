import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import ProfileAvatar from "../components/ProfileAvatar";
import RecipeLikeButton from "../components/RecipeLikeButton";
import RecipeSaveButton from "../components/RecipeSaveButton";
import RecipeComments from "../components/RecipeComments";
import CulinaryChat from "../components/CulinaryChat";

function FeedPostLayout({ recipe, onLikeUpdated, onSaveUpdated, onCommentsCountChanged, currentUserId }) {
    const authorName = recipe.author?.displayName || recipe.author?.username || "Unknown author";
    const authorUsername = recipe.author?.username;
    const [imageFailed, setImageFailed] = useState(false);
    const [commentsOpen, setCommentsOpen] = useState(false);
    const hasImage = Boolean(recipe.imageUrl) && !imageFailed;
    const totalMinutes = Math.max(0, Number(recipe.prepTimeMinutes) || 0)
        + Math.max(0, Number(recipe.cookTimeMinutes) || 0);

    const authorIdentity = (
        <>
            <span className="feed-post-author-name">{authorName}</span>
            {authorUsername && (
                <span className="feed-post-author-username">@{authorUsername}</span>
            )}
        </>
    );

    const recipeContent = (
        <div className="feed-post-content">
            <h2>
                <Link to={`/recipes/${recipe._id}`}>{recipe.title}</Link>
            </h2>
            <p className="feed-post-description">{recipe.description}</p>
            <p className="feed-post-metadata">
                {totalMinutes} min total · {recipe.servings} {recipe.servings === 1 ? "serving" : "servings"}
            </p>
            <Link className="feed-post-view-link" to={`/recipes/${recipe._id}`}>
                View recipe
            </Link>
        </div>
    );

    const actionRow = (
        <div className={hasImage ? "feed-post-actions" : "feed-post-actions feed-post-actions-compact"}>
            <div className="feed-post-social-actions">
                <RecipeLikeButton recipe={recipe} onLikeUpdated={onLikeUpdated} />
                <button
                    className={commentsOpen ? "recipe-comment-button is-open" : "recipe-comment-button"}
                    type="button"
                    onClick={() => setCommentsOpen((open) => !open)}
                    aria-expanded={commentsOpen}
                    aria-controls={`feed-comments-${recipe._id}`}
                    aria-label={`${commentsOpen ? "Hide" : "Show"} comments for ${recipe.title}`}
                >
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 5.75h14v10.5H9l-4 3.25z" /></svg>
                    <span>{Math.max(0, Number(recipe.commentsCount) || 0)}</span>
                </button>
            </div>
            <RecipeSaveButton recipe={recipe} onSaveUpdated={onSaveUpdated} />
        </div>
    );

    const commentsPanel = commentsOpen && (
        <div className="feed-post-comments" id={`feed-comments-${recipe._id}`}>
            <RecipeComments
                recipeId={recipe._id}
                currentUserId={currentUserId}
                compact
                onCommentsCountChange={(delta) => onCommentsCountChanged(recipe._id, delta)}
            />
        </div>
    );

    return (
        <article className="feed-post">
            <header className="feed-post-author">
                {authorUsername ? (
                    <Link
                        className="feed-post-avatar-link"
                        to={`/users/${encodeURIComponent(authorUsername)}`}
                        aria-label={`View ${authorName}'s profile`}
                    >
                        <ProfileAvatar
                            className="feed-post-avatar"
                            imageUrl={recipe.author?.profilePhotoUrl}
                            name={authorName}
                            decorative
                        />
                    </Link>
                ) : (
                    <ProfileAvatar
                        className="feed-post-avatar"
                        imageUrl={recipe.author?.profilePhotoUrl}
                        name={authorName}
                        decorative
                    />
                )}

                <div className="feed-post-author-copy">
                    {authorUsername ? (
                        <Link to={`/users/${encodeURIComponent(authorUsername)}`}>
                            {authorIdentity}
                        </Link>
                    ) : (
                        authorIdentity
                    )}
                </div>
            </header>

            {hasImage && (
                <Link
                    className="feed-post-image-link"
                    to={`/recipes/${recipe._id}`}
                    aria-label={`View ${recipe.title}`}
                >
                    <img
                        className="feed-post-image"
                        src={recipe.imageUrl}
                        alt={recipe.title}
                        loading="lazy"
                        onError={() => setImageFailed(true)}
                    />
                </Link>
            )}

            {hasImage ? (
                <>
                    {actionRow}
                    {recipeContent}
                    {commentsPanel}
                </>
            ) : (
                <>
                    {recipeContent}
                    {actionRow}
                    {commentsPanel}
                </>
            )}
        </article>
    );
}

function FeedPost(props) {
    // A new URL remounts this small image boundary, allowing a repaired or
    // updated image to be attempted after a previous load error.
    return <FeedPostLayout key={props.recipe.imageUrl || "no-image"} {...props} />;
}

export default function Feed({ user }) {
    const location = useLocation();
    const navigate = useNavigate();
    const params = new URLSearchParams(location.search);
    const searchTerm = (params.get("search") || "").trim();
    const titleOnlySearch = params.get("searchMode") === "titles";
    const feed = params.get("feed") === "following" ? "following" : "discover";
    const category = ["breakfast", "lunch", "dinner", "snack", "dessert", "drink", "other"].includes(params.get("category"))
        ? params.get("category")
        : "all";
    const maxTotalMinutes = ["15", "30", "60"].includes(params.get("maxTotalMinutes"))
        ? params.get("maxTotalMinutes")
        : "";
    const ignoreAiCategory = params.get("aiIgnoreCategory") === "1";
    const ignoreAiTime = params.get("aiIgnoreTime") === "1";
    const filterKey = JSON.stringify({ feed, searchTerm, titleOnlySearch, category, maxTotalMinutes, ignoreAiCategory, ignoreAiTime });

    const [recipes, setRecipes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [pagination, setPagination] = useState({ filterKey: "", cursor: null });
    const [nextCursor, setNextCursor] = useState(null);
    const [loadingMore, setLoadingMore] = useState(false);
    const [loadMoreError, setLoadMoreError] = useState("");
    const [retryCount, setRetryCount] = useState(0);
    const [naturalSearch, setNaturalSearch] = useState(null);
    const naturalSearchIdRef = useRef(null);

    // A cursor only belongs to the exact feed/search URL that produced it.
    // This keeps Back/Forward or a new navbar search from mixing result pages.
    const cursor = pagination.filterKey === filterKey ? pagination.cursor : null;

    useEffect(() => {
        const controller = new AbortController();
        const isFirstPage = cursor === null;

        async function fetchRecipes() {
            if (isFirstPage) {
                setLoading(true);
                setLoadingMore(false);
                setError("");
                setLoadMoreError("");
                setRecipes([]);
                setNextCursor(null);
            } else {
                setLoadingMore(true);
                setLoadMoreError("");
            }

            try {
                const useNaturalSearch = Boolean(searchTerm) && !titleOnlySearch;
                let response;

                if (useNaturalSearch) {
                    const body = isFirstPage
                        ? { query: searchTerm, feed, category, maxTotalMinutes: maxTotalMinutes || undefined, ignoreAiCategory, ignoreAiTime }
                        : { searchId: naturalSearchIdRef.current, cursor };
                    response = await fetch("/api/recipes/natural-search", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        signal: controller.signal,
                        body: JSON.stringify(body)
                    });
                } else {
                    const query = new URLSearchParams({ feed });
                    if (searchTerm) query.set("search", searchTerm);
                    if (category !== "all") query.set("category", category);
                    if (maxTotalMinutes) query.set("maxTotalMinutes", maxTotalMinutes);
                    if (cursor) query.set("cursor", cursor);
                    response = await fetch(`/api/recipes?${query.toString()}`, {
                        credentials: "include",
                        signal: controller.signal
                    });
                }
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.message || "Unable to load recipes.");
                }

                if (controller.signal.aborted) return;

                if (isFirstPage) {
                    setRecipes(data.recipes);
                    setNaturalSearch(useNaturalSearch ? {
                        id: data.searchId,
                        intent: data.intent,
                        clarification: data.clarification || ""
                    } : null);
                    naturalSearchIdRef.current = useNaturalSearch ? data.searchId : null;
                } else {
                    setRecipes((previous) => {
                        const existingIds = new Set(previous.map((recipe) => recipe._id));
                        return [
                            ...previous,
                            ...data.recipes.filter((recipe) => !existingIds.has(recipe._id))
                        ];
                    });
                }

                setNextCursor(data.nextCursor);
            } catch (requestError) {
                if (controller.signal.aborted) return;

                if (isFirstPage) {
                    setError(requestError.message);
                } else {
                    setLoadMoreError(requestError.message);
                }
            } finally {
                if (!controller.signal.aborted) {
                    setLoading(false);
                    setLoadingMore(false);
                }
            }
        }

        fetchRecipes();

        return () => controller.abort();
    }, [feed, searchTerm, titleOnlySearch, category, maxTotalMinutes, ignoreAiCategory, ignoreAiTime, cursor, retryCount]);

    function handleFeedChange(nextFeed) {
        if (nextFeed === feed) return;

        const nextParams = new URLSearchParams(location.search);

        if (nextFeed === "following") {
            nextParams.set("feed", "following");
        } else {
            nextParams.delete("feed");
        }

        navigate({
            pathname: "/",
            search: nextParams.toString() ? `?${nextParams.toString()}` : ""
        });
    }

    function handleLoadMore() {
        if (loading || loadingMore || !nextCursor) return;

        setPagination({ filterKey, cursor: nextCursor });
    }

    function handleFilterChange(name, value) {
        const nextParams = new URLSearchParams(location.search);
        if (name === "category") {
            if (value === "all") nextParams.set("aiIgnoreCategory", "1");
            else nextParams.delete("aiIgnoreCategory");
        }
        if (name === "maxTotalMinutes") {
            if (!value) nextParams.set("aiIgnoreTime", "1");
            else nextParams.delete("aiIgnoreTime");
        }
        if (!value || value === "all") nextParams.delete(name);
        else nextParams.set(name, value);
        navigate({ pathname: "/", search: nextParams.toString() ? `?${nextParams.toString()}` : "" });
    }

    function resetFilters() {
        const nextParams = new URLSearchParams(location.search);
        nextParams.delete("category");
        nextParams.delete("maxTotalMinutes");
        navigate({ pathname: "/", search: nextParams.toString() ? `?${nextParams.toString()}` : "" });
    }

    function searchTitlesInstead() {
        const nextParams = new URLSearchParams(location.search);
        nextParams.set("searchMode", "titles");
        navigate({ pathname: "/", search: `?${nextParams.toString()}` });
    }

    function removeInterpretedConstraint(name) {
        const nextParams = new URLSearchParams(location.search);
        if (name === "category") {
            nextParams.delete("category");
            nextParams.set("aiIgnoreCategory", "1");
        }
        if (name === "maxTotalMinutes") {
            nextParams.delete("maxTotalMinutes");
            nextParams.set("aiIgnoreTime", "1");
        }
        navigate({ pathname: "/", search: `?${nextParams.toString()}` });
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

    function handleCommentsCountChanged(recipeId, delta) {
        setRecipes((previous) => previous.map((recipe) => recipe._id === recipeId
            ? { ...recipe, commentsCount: Math.max(0, (Number(recipe.commentsCount) || 0) + delta) }
            : recipe));
    }

    function openRecipeComposer() {
        navigate("/my-recipes?create=1");
    }

    return (
        <main className="main-content social-feed-layout">
            <section className="social-feed-page">
                <h1 className="visually-hidden">Recipe feed</h1>

                <div className="social-feed-shell">
                <div className="social-feed-controls">
                    <div className="feed-tabs" role="group" aria-label="Recipe feed">
                        <button
                            type="button"
                            className={feed === "discover" ? "feed-tab active" : "feed-tab"}
                            aria-pressed={feed === "discover"}
                            onClick={() => handleFeedChange("discover")}
                        >
                            Discover
                        </button>
                        <button
                            type="button"
                            className={feed === "following" ? "feed-tab active" : "feed-tab"}
                            aria-pressed={feed === "following"}
                            onClick={() => handleFeedChange("following")}
                        >
                            Following
                        </button>
                    </div>

                    {searchTerm && (
                        <div className="natural-search-heading">
                            <p className="social-feed-results">Results for “{searchTerm}”{titleOnlySearch ? " (title-only)" : ""}</p>
                            {!titleOnlySearch && naturalSearch?.intent && (
                                <div className="natural-search-chips" aria-label="Interpreted recipe constraints">
                                    {naturalSearch.intent.requiredIngredients.map((item) => <span key={`required-${item}`}>with {item}</span>)}
                                    {naturalSearch.intent.excludedIngredients.map((item) => <span key={`excluded-${item}`}>without {item}</span>)}
                                    {(naturalSearch.intent.excludedEquipment || []).map((item) => <span key={`equipment-${item}`}>without {item}</span>)}
                                    {naturalSearch.intent.category && <button type="button" onClick={() => removeInterpretedConstraint("category")} aria-label={`Remove ${naturalSearch.intent.category} category`}>{naturalSearch.intent.category} ×</button>}
                                    {naturalSearch.intent.maxTotalMinutes && <button type="button" onClick={() => removeInterpretedConstraint("maxTotalMinutes")} aria-label={`Remove ${naturalSearch.intent.maxTotalMinutes} minute limit`}>up to {naturalSearch.intent.maxTotalMinutes} min ×</button>}
                                    {naturalSearch.intent.assumptions.map((item) => <span key={`assumption-${item}`}>Assumption: {item}</span>)}
                                </div>
                            )}
                            {!titleOnlySearch && naturalSearch?.clarification && (
                                <div className="natural-search-clarification" role="status">
                                    <p>{naturalSearch.clarification}</p>
                                    <button type="button" onClick={() => handleFilterChange("maxTotalMinutes", "30")}>Use up to 30 min</button>
                                </div>
                            )}
                        </div>
                    )}
                    <div className="feed-filters" aria-label="Feed filters">
                        <label className="feed-filter-control">
                            <span>Category</span>
                            <select value={category} onChange={(event) => handleFilterChange("category", event.target.value)}>
                                <option value="all">All</option>
                                <option value="breakfast">Breakfast</option><option value="lunch">Lunch</option><option value="dinner">Dinner</option><option value="snack">Snack</option><option value="dessert">Dessert</option><option value="drink">Drink</option><option value="other">Other</option>
                            </select>
                        </label>
                        <label className="feed-filter-control">
                            <span>Time</span>
                            <select value={maxTotalMinutes} onChange={(event) => handleFilterChange("maxTotalMinutes", event.target.value)}>
                                <option value="">Any</option><option value="15">Up to 15 min</option><option value="30">Up to 30 min</option><option value="60">Up to 60 min</option>
                            </select>
                        </label>
                        {(category !== "all" || maxTotalMinutes) && <button type="button" onClick={resetFilters}>Reset filters</button>}
                    </div>
                </div>

                <section className="feed-composer" aria-label="Share a recipe">
                    <Link className="feed-composer-avatar-link" to="/profile" aria-label="Open my profile">
                        <ProfileAvatar
                            className="feed-composer-avatar"
                            imageUrl={user.profilePhotoUrl}
                            name={user.displayName || user.username}
                            decorative
                        />
                    </Link>
                    <button
                        className="feed-composer-prompt"
                        type="button"
                        onClick={openRecipeComposer}
                        aria-label="Create a recipe"
                    >
                        What’s cooking today?
                    </button>
                </section>

                <section className="social-feed" aria-live="polite">
                    {loading && <p role="status">Loading recipes…</p>}

                    {error && (
                        <div className="social-feed-message">
                            <p role="alert">{error}</p>
                            <button type="button" onClick={() => setRetryCount((previous) => previous + 1)}>
                                Retry
                            </button>
                            {searchTerm && !titleOnlySearch && <button type="button" onClick={searchTitlesInstead}>Search titles instead</button>}
                        </div>
                    )}

                    {!loading && !error && recipes.length === 0 && (
                        feed === "following" ? (
                            <div className="following-empty-state">
                                <p>
                                    {searchTerm
                                        ? "No recipes from the cooks you follow matched your search."
                                        : "No recipes here yet. Follow cooks to see their recipes."}
                                </p>
                                {!searchTerm && (
                                    <button type="button" onClick={() => handleFeedChange("discover")}>
                                        Discover recipes
                                    </button>
                                )}
                            </div>
                        ) : (
                            <p className="social-feed-empty">
                                {searchTerm
                                    ? "No recipes matched your search. Try another title."
                                    : "No recipes yet. Be the first to share one!"}
                            </p>
                        )
                    )}

                    {!error && recipes.map((recipe) => (
                        <FeedPost
                            key={recipe._id}
                            recipe={recipe}
                            onLikeUpdated={handleLikeUpdated}
                            onSaveUpdated={handleSaveUpdated}
                            onCommentsCountChanged={handleCommentsCountChanged}
                            currentUserId={user.id}
                        />
                    ))}
                </section>

                {!loading && !error && (
                    <div className="feed-pagination">
                        {loadMoreError ? (
                            <>
                                <p role="alert">{loadMoreError}</p>
                                <button type="button" onClick={() => setRetryCount((previous) => previous + 1)}>
                                    Retry loading more
                                </button>
                            </>
                        ) : nextCursor ? (
                            <button
                                type="button"
                                className="primary-button"
                                onClick={handleLoadMore}
                                disabled={loadingMore}
                            >
                                {loadingMore ? "Loading…" : "Load more"}
                            </button>
                        ) : recipes.length > 0 ? (
                            <p>You’ve reached the end of the results.</p>
                        ) : null}
                    </div>
                )}
                </div>
            </section>
            <CulinaryChat />
        </main>
    );
}
