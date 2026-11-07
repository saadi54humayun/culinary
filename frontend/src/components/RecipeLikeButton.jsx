import { useEffect, useRef, useState } from "react";

export default function RecipeLikeButton({ recipe, onLikeUpdated }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const controllerRef = useRef(null);

  const likedByMe = Boolean(recipe.likedByMe);
  const likesCount = Math.max(0, Number(recipe.likesCount) || 0);

  useEffect(() => {
    return () => controllerRef.current?.abort();
  }, []);

  async function handleClick() {
    if (pending) return;

    const controller = new AbortController();
    controllerRef.current = controller;
    setPending(true);
    setError("");

    try {
      const response = await fetch(`/api/recipes/${recipe._id}/like`, {
        method: likedByMe ? "DELETE" : "PUT",
        credentials: "include",
        signal: controller.signal
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to update this like.");
      }

      if (!controller.signal.aborted) {
        onLikeUpdated(recipe._id, {
          likedByMe: data.likedByMe,
          likesCount: data.likesCount
        });
      }
    } catch (requestError) {
      if (!controller.signal.aborted) {
        setError(requestError.message);
      }
    } finally {
      if (!controller.signal.aborted) {
        setPending(false);
      }
    }
  }

  const action = likedByMe ? "Unlike" : "Like";

  return (
    <div className="recipe-like-control">
      <button
        className={likedByMe ? "recipe-like-button is-liked" : "recipe-like-button"}
        type="button"
        onClick={handleClick}
        disabled={pending}
        aria-pressed={likedByMe}
        aria-label={`${action} ${recipe.title}`}
        aria-busy={pending}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 21s-7-4.4-9.4-8.5C.6 9.2 2.2 5 5.8 5c2 0 3.7 1.1 4.6 2.7C11.3 6.1 13 5 15 5c3.6 0 5.2 4.2 3.2 7.5C19 16.6 12 21 12 21Z" />
        </svg>
      </button>
      <span
        className="recipe-like-count"
        aria-label={`${likesCount} ${likesCount === 1 ? "like" : "likes"}`}
      >
        {likesCount}
      </span>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
