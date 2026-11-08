import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import "./Pantry.css";

const UNITS = [
  ["", "Count (no unit)"], ["piece", "Pieces"], ["g", "Grams (g)"], ["kg", "Kilograms (kg)"],
  ["ml", "Milliliters (ml)"], ["l", "Liters (l)"], ["tsp", "Teaspoons"],
  ["tbsp", "Tablespoons"], ["cup", "Cups"], ["clove", "Cloves"], ["pinch", "Pinches"]
];
const CATEGORIES = ["all", "breakfast", "lunch", "dinner", "snack", "dessert", "drink", "other"];
const EMPTY_FORM = { name: "", quantity: "", unit: "" };

async function readJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Request failed. Please try again.");
  return data;
}

export default function Pantry() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [filters, setFilters] = useState({ search: "", category: "all" });
  const [matches, setMatches] = useState([]);
  const [matching, setMatching] = useState(false);
  const [matchError, setMatchError] = useState("");
  const [matchInfo, setMatchInfo] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/pantry", { credentials: "include", signal: controller.signal });
        const data = await readJson(response);
        if (!controller.signal.aborted) setItems(data.items);
      } catch (err) {
        if (!controller.signal.aborted) setError(err.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, [refreshKey]);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setMatching(true);
      setMatchError("");
      try {
        const params = new URLSearchParams(filters);
        const response = await fetch(`/api/pantry/recipes?${params}`, { credentials: "include", signal: controller.signal });
        const data = await readJson(response);
        if (!controller.signal.aborted) { setMatches(data.matches); setMatchInfo(data); }
      } catch (err) {
        if (!controller.signal.aborted) setMatchError(err.message);
      } finally {
        if (!controller.signal.aborted) setMatching(false);
      }
    }
    load();
    return () => controller.abort();
  }, [filters, refreshKey]);

  function cancelEdit() { setEditId(null); setForm(EMPTY_FORM); }

  function editItem(item) {
    setEditId(item._id);
    setForm({ name: item.name, quantity: String(item.quantity), unit: item.unit });
    setNotice(""); setError("");
    document.querySelector("#pantry-item-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function saveItem(event) {
    event.preventDefault();
    if (saving) return;
    const quantity = Number(form.quantity);
    if (!form.name.trim() || !Number.isFinite(quantity) || quantity < 0.001 || quantity > 1000000) {
      setError("Enter an ingredient name and a quantity of at least 0.001 (up to 1,000,000).");
      return;
    }
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch(editId ? `/api/pantry/${editId}` : "/api/pantry", {
        method: editId ? "PUT" : "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name.trim(), quantity, unit: form.unit })
      });
      await readJson(response);
      setNotice(editId ? "Pantry item updated." : "Ingredient added to your pantry.");
      cancelEdit();
      setRefreshKey((key) => key + 1);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  async function removeItem(item) {
    if (saving || !window.confirm(`Remove ${item.name} from your pantry?`)) return;
    setSaving(true); setError(""); setNotice("");
    try {
      await readJson(await fetch(`/api/pantry/${item._id}`, { method: "DELETE", credentials: "include" }));
      if (editId === item._id) cancelEdit();
      setNotice("Ingredient removed.");
      setRefreshKey((key) => key + 1);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  function submitFilters(event) {
    event.preventDefault();
    setFilters({ search: search.trim(), category });
  }

  const grouped = items.reduce((result, item) => {
    const categoryName = item.category || "Other";
    (result[categoryName] ||= []).push(item);
    return result;
  }, {});
  const readyCount = matches.filter((match) => match.status === "ready").length;

  return (
    <main className="main-content pantry-page">
      <section className="welcome pantry-intro">
        <div>
          <p className="eyebrow">COOK WITH WHAT YOU HAVE</p>
          <h1>My Pantry</h1>
          <p>Keep track of ingredients at home, find matching recipes, and reduce your meal planner shopping list.</p>
        </div>
        <Link className="primary-button" to="/meal-planner">Open meal planner</Link>
      </section>
      <div className="pantry-layout">
        <section className="pantry-panel" aria-label="Your pantry inventory">
          <div className="pantry-panel-heading"><h2>Inventory</h2><span>{items.length} items</span></div>
          <form id="pantry-item-form" onSubmit={saveItem} className="pantry-item-form">
            <h3>{editId ? "Edit pantry ingredient" : "Add an ingredient"}</h3>
            <label htmlFor="pantry-name">Ingredient name</label>
            <input id="pantry-name" value={form.name} required maxLength={100}
              onChange={(event) => setForm((old) => ({ ...old, name: event.target.value }))}
              placeholder="e.g. Rice, onions, chicken" />
            <div className="pantry-quantity-row">
              <label htmlFor="pantry-quantity">Quantity
                <input id="pantry-quantity" value={form.quantity} type="number" min="0.001" max="1000000" step="any" required
                  placeholder="e.g. 500" onChange={(event) => setForm((old) => ({ ...old, quantity: event.target.value }))} />
              </label>
              <label htmlFor="pantry-unit">Unit
                <select id="pantry-unit" value={form.unit} onChange={(event) => setForm((old) => ({ ...old, unit: event.target.value }))}>
                  {UNITS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
            </div>
            <div className="pantry-form-actions">
              <button type="submit" disabled={saving}>{saving ? "Saving…" : editId ? "Save changes" : "Add to pantry"}</button>
              {editId && <button type="button" onClick={cancelEdit} disabled={saving}>Cancel</button>}
            </div>
          </form>
          {error && <p className="pantry-error" role="alert">{error}</p>}
          {notice && <p role="status">{notice}</p>}
          {loading ? <p>Loading your pantry…</p> : items.length === 0 ? <div className="pantry-empty-inventory"><span aria-hidden="true">🥕</span><strong>Start with what you have</strong><p>Add a few ingredients from your kitchen and we'll show recipes that match.</p></div> : (
            Object.entries(grouped).map(([name, groupItems]) => (
              <div className="pantry-group" key={name}>
                <h3>{name}</h3>
                <ul>
                  {groupItems.map((item) => <li key={item._id}>
                    <div><strong>{item.name}</strong><small>{item.quantity} {item.unit}</small></div>
                    <div className="pantry-item-actions">
                      <button type="button" onClick={() => editItem(item)} disabled={saving}>Edit</button>
                      <button type="button" onClick={() => removeItem(item)} disabled={saving}>Remove</button>
                    </div>
                  </li>)}
                </ul>
              </div>
            ))
          )}
        </section>

        <section className="pantry-panel pantry-discover" aria-label="Recipes matching your pantry">
          <div className="pantry-panel-heading"><div><h2>What Can I Cook?</h2><p>Ranked by how many ingredients you have.</p></div></div>
          <form className="pantry-filters" onSubmit={submitFilters} role="search">
            <label htmlFor="pantry-search">Search recipes
              <input id="pantry-search" type="search" value={search} maxLength={80} placeholder="Search recipes or ingredients"
                onChange={(event) => setSearch(event.target.value)} />
            </label>
            <label htmlFor="pantry-category">Category
              <select id="pantry-category" value={category} onChange={(event) => setCategory(event.target.value)}>
                {CATEGORIES.map((option) => <option key={option} value={option}>{option === "all" ? "All categories" : option[0].toUpperCase() + option.slice(1)}</option>)}
              </select>
            </label>
            <button type="submit" disabled={matching}>Find recipes</button>
          </form>
          <p className="pantry-help">Matches compare ingredient names and compatible units. They do not guarantee you have every ingredient or enough for a different serving size.</p>
          {matchError && <p className="pantry-error" role="alert">{matchError}</p>}
          {matching && <p role="status">Finding recipes…</p>}
          {!matching && !matchError && <p className="pantry-match-summary" role="status">
            {readyCount} ready to cook · {matches.length} recipes shown
            {matchInfo?.limited ? " (newest 200 eligible recipes scanned)" : ""}
          </p>}
          {!matching && !matchError && matches.length === 0 && <div className="pantry-empty-matches"><h3>No matching recipes yet</h3><p>Try a broader search or add a few more pantry ingredients.</p></div>}
          <div className="pantry-recipe-grid">
            {matches.map((match) => (
              <article className="pantry-recipe-card" key={match.recipe._id}>
                {match.recipe.imageUrl && <img src={match.recipe.imageUrl} alt="" loading="lazy" />}
                <div className="pantry-recipe-content">
                  <span className={`pantry-match-status pantry-match-${match.status}`}>
                    {match.status === "ready" ? "Ingredients available" : match.status === "review" ? "Check quantities" : `${match.missing.length} ingredient${match.missing.length === 1 ? "" : "s"} missing`}
                  </span>
                  <h3><Link to={`/recipes/${match.recipe._id}`}>{match.recipe.title}</Link></h3>
                  <p>{match.matchedCount}/{match.ingredientCount} ingredients matched · Serves {match.recipe.servings || "?"}</p>
                  {match.missing.length > 0 && <p><strong>To buy:</strong> {match.missing.slice(0, 4).map((item) => `${item.name} (${item.amount})`).join(", ")}{match.missing.length > 4 ? "…" : ""}</p>}
                  {match.uncertain.length > 0 && <p><strong>Verify:</strong> {match.uncertain.slice(0, 3).map((item) => item.name).join(", ")}</p>}
                  <Link className="pantry-recipe-link" to={`/recipes/${match.recipe._id}`}>View recipe →</Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
