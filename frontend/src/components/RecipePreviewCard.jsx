import { useState } from "react";
import { Link } from "react-router-dom";
import RecipeLikeButton from "./RecipeLikeButton";
import RecipeSaveButton from "./RecipeSaveButton";

/** Shared presentation only; existing like/save/edit/delete APIs stay unchanged. */
export default function RecipePreviewCard({ recipe, onLikeUpdated, onSaveUpdated, owner = false, onEdit, onDelete, deleting = false }) {
  const [imageFailed, setImageFailed] = useState(false);
  const minutes = Math.max(0, Number(recipe.prepTimeMinutes) || 0) + Math.max(0, Number(recipe.cookTimeMinutes) || 0);
  const author = recipe.author?.displayName || recipe.author?.username || "a Culinary cook";
  return (
    <article className="recipe-card culinary-recipe-card">
      <Link className="recipe-photo-link culinary-recipe-photo" to={`/recipes/${recipe._id}`} aria-label={`View ${recipe.title}`}>
        {recipe.imageUrl && !imageFailed ? (
          <img className="recipe-card-photo" src={recipe.imageUrl} alt={recipe.title} loading="lazy" onError={() => setImageFailed(true)} />
        ) : (
          <div className="recipe-photo-placeholder culinary-photo-fallback" aria-label="No recipe photo available">
            <span aria-hidden="true">🍲</span><span>Ready to cook something delicious?</span>
          </div>
        )}
        {recipe.category && <span className="culinary-photo-category">{recipe.category}</span>}
      </Link>
      <div className="culinary-recipe-card-content">
        <h3><Link to={`/recipes/${recipe._id}`}>{recipe.title}</Link></h3>
        <p className="culinary-recipe-card-description">{recipe.description || "Explore this recipe on Culinary."}</p>
        <div className="culinary-recipe-facts">
          <span>{minutes} min total</span><span>{recipe.servings || 1} servings</span>
          {owner && recipe.status === "draft" && <span>Private draft</span>}
        </div>
        <div className="culinary-recipe-card-footer">
          <p className="recipe-author">{owner ? "By you" : <>By {recipe.author?.username ? <Link to={`/users/${encodeURIComponent(recipe.author.username)}`}>{author}</Link> : author}</>}</p>
          <div className="recipe-card-actions">
            <RecipeLikeButton recipe={recipe} onLikeUpdated={onLikeUpdated} />
            <RecipeSaveButton recipe={recipe} onSaveUpdated={onSaveUpdated} />
          </div>
        </div>
        {owner && (
          <div className="culinary-recipe-owner-actions">
            <button type="button" onClick={() => onEdit?.(recipe)}>Edit recipe</button>
            <button type="button" className="danger-action" onClick={() => onDelete?.(recipe._id)} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
