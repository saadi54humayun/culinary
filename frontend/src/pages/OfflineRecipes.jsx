import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { listOfflineRecipes, getOfflineRecipe, removeOfflineRecipe } from "../offline/storage";
import "./OfflineRecipes.css";

export default function OfflineRecipes({ user, offlineOnly = false }) {
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const userId = user?.id || user?._id;

  useEffect(() => {
    let active = true;
    setLoading(true);
    listOfflineRecipes(userId).then((recipes) => {
      if (active) setItems(recipes);
    }).catch((error) => {
      if (active) setMessage(error.message);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId]);

  async function remove(id) {
    if (!window.confirm("Remove this downloaded recipe and its offline cooking progress?")) return;
    try {
      await removeOfflineRecipe(userId, id);
      setItems((old) => old.filter((item) => item.recipeId !== id));
      setMessage("Download removed from this device.");
    } catch (error) { setMessage(error.message); }
  }

  return <main className="main-content offline-recipes">
    <div className="offline-heading"><div><h1>Offline recipes</h1><p>Recipes you chose to download on this device.</p></div><span className="offline-status">{offlineOnly ? "● Offline library" : "✓ Available offline"}</span></div>
    {offlineOnly && <p role="status" className="offline-notice">Culinary can't verify your session right now. Only downloaded recipes and local cooking progress are available. Reconnect to sync your changes.</p>}
    {loading && <p>Loading downloads…</p>}
    {message && <p role="status">{message}</p>}
    {!offlineOnly && <p className="offline-footnote">On iPhone: open Culinary in Safari, tap Share, then Add to Home Screen. Open the installed app and download your recipes there; the installed app can have separate storage from Safari.</p>}
    {!loading && items.length === 0 && <section className="offline-empty"><h2>No recipes downloaded yet</h2><p>When you're online, open any published recipe and choose <strong>Save for offline cooking</strong>. Open Culinary from the Home Screen at least once while online.</p>{!offlineOnly && <Link className="primary-button" to="/">Discover recipes</Link>}</section>}
    <div className="offline-recipe-grid">{items.map(({ recipe }) => <article key={recipe._id} className="offline-recipe-card">
      {recipe.imageUrl && <img src={recipe.imageUrl} alt="" loading="lazy" onError={(event) => { event.currentTarget.hidden = true; }} />}
      <div><h2>{recipe.title}</h2><p>{recipe.ingredients?.length || 0} ingredients · {recipe.steps?.length || 0} steps</p>
        <div className="offline-actions"><Link to={`/offline-recipes/${recipe._id}`}>View recipe</Link><Link className="primary-button" to={`/recipes/${recipe._id}/cook`}>Start cooking</Link><button type="button" onClick={() => remove(recipe._id)}>Remove download</button></div>
      </div>
    </article>)}</div>
  </main>;
}

export function OfflineRecipeDetails({ user }) {
  const { id } = useParams();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const userId = user?.id || user?._id;
  useEffect(() => {
    let active = true;
    setLoading(true);
    getOfflineRecipe(userId, id).then((recipe) => { if (active) setItem(recipe); }).catch((err) => {
      if (active) setError(err.message);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, userId]);
  const recipe = item?.recipe;
  return <main className="main-content offline-recipe-details">
    <Link to="/offline-recipes">← Offline recipes</Link>
    {loading && <p>Opening recipe…</p>}{error && <p role="alert">{error}</p>}
    {!loading && !recipe && <p>This recipe isn't available offline on this device.</p>}
    {recipe && <article>
      <h1>{recipe.title}</h1><p>{recipe.description}</p>
      {recipe.imageUrl && <img className="offline-detail-photo" src={recipe.imageUrl} alt={recipe.title} onError={(event) => { event.currentTarget.hidden = true; }} />}
      <p>Serves {recipe.servings} · Prep {recipe.prepTimeMinutes || 0} min · Cook {recipe.cookTimeMinutes || 0} min</p>
      <Link className="primary-button" to={`/recipes/${recipe._id}/cook`}>Start cooking →</Link>
      <h2>Ingredients</h2><ul>{recipe.ingredients?.map((item, index) => <li key={index}>{[item.quantity, item.unit, item.name].filter(Boolean).join(" ")}</li>)}</ul>
      <h2>Instructions</h2><ol>{recipe.steps?.map((step, index) => <li key={index}>{step}</li>)}</ol>
      <p className="offline-footnote">Saved copy; changes to the online recipe won't appear until you download it again.</p>
    </article>}
  </main>;
}
