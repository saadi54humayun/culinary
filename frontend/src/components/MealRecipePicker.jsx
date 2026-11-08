import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import "./MealRecipePicker.css";

const TABS = [
  { value: "saved", label: "Saved" },
  { value: "mine", label: "My recipes" },
  { value: "discover", label: "Discover" }
];

export default function MealRecipePicker({ open, title, onClose, onSelect, disabled }) {
  const [scope, setScope] = useState("saved");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [recipes, setRecipes] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selecting, setSelecting] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const timeout = setTimeout(() => { setQuery(search.trim()); setPage(0); }, 250);
    return () => clearTimeout(timeout);
  }, [open, search]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ scope, search: query, page: String(page) });
    fetch(`/api/meal-plans/recipes?${params}`, { credentials: "include", signal: controller.signal })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || "Unable to load recipes.");
        return data;
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setRecipes((previous) => page === 0 ? data.recipes : [...previous, ...data.recipes]);
        setHasMore(data.hasMore);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, scope, query, page]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event) { if (event.key === "Escape" && !selecting) onClose(); }
    document.addEventListener("keydown", onKeyDown);
    searchRef.current?.focus();
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, selecting]);

  if (!open) return null;

  function chooseScope(nextScope) {
    setScope(nextScope); setPage(0); setRecipes([]); setHasMore(false);
    setLoading(true); setError("");
  }

  async function selectRecipe(recipe) {
    if (selecting || disabled) return;
    setSelecting(true); setError("");
    try {
      const success = await onSelect(recipe);
      if (success !== false) onClose();
    } catch (err) {
      setError(err.message || "Unable to select recipe.");
    } finally { setSelecting(false); }
  }

  return (
    <div className="meal-picker-overlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !selecting) onClose();
    }}>
      <section className="meal-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="meal-picker-title">
        <header className="meal-picker-header">
          <div><p className="eyebrow">RECIPE LIBRARY</p><h2 id="meal-picker-title">{title || "Choose a recipe"}</h2></div>
          <button type="button" className="meal-picker-close" onClick={onClose} disabled={selecting} aria-label="Close recipe picker">✕</button>
        </header>
        <div className="meal-picker-search">
          <label htmlFor="meal-picker-query">Search recipes by name or ingredient</label>
          <input ref={searchRef} id="meal-picker-query" type="search" value={search} placeholder="Search pasta, chicken, rice…"
            onChange={(event) => { setSearch(event.target.value); setPage(0); setRecipes([]); setLoading(true); setError(""); }} maxLength={100}/>
        </div>
        <div className="meal-picker-tabs" role="tablist" aria-label="Recipe source">
          {TABS.map((tab) => (
            <button key={tab.value} type="button" role="tab" aria-selected={scope === tab.value}
              className={scope === tab.value ? "active" : ""} onClick={() => chooseScope(tab.value)}>{tab.label}</button>
          ))}
        </div>
        {error && <p role="alert" className="meal-planner-error">{error}</p>}
        <div className="meal-picker-results">
          {recipes.map((recipe) => (
            <article key={recipe._id} className="meal-picker-result">
              {recipe.imageUrl ? <img loading="lazy" alt="" src={recipe.imageUrl} /> : <div className="meal-picker-placeholder" aria-hidden="true">🍽</div>}
              <div className="meal-picker-result-info">
                <h3>{recipe.title}</h3>
                <p>{recipe.category || "Recipe"} · {(recipe.prepTimeMinutes || 0) + (recipe.cookTimeMinutes || 0)} min
                  {recipe.servings ? ` · ${recipe.servings} servings` : ""}</p>
                <Link to={`/recipes/${recipe._id}`} target="_blank" rel="noopener noreferrer">View recipe</Link>
              </div>
              <button type="button" onClick={() => selectRecipe(recipe)} disabled={selecting || disabled}>Select</button>
            </article>
          ))}
          {!loading && !recipes.length && !error && (
            <p className="meal-picker-empty">No matching recipes in {TABS.find((tab) => tab.value === scope)?.label}. Try another tab or search term.</p>
          )}
          {loading && <p role="status">Loading recipes…</p>}
          {hasMore && !loading && <button type="button" onClick={() => { setPage((value) => value + 1); setLoading(true); }} disabled={selecting}>Load more</button>}
        </div>
      </section>
    </div>
  );
}
