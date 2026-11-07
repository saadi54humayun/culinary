import { useEffect, useRef, useState } from "react";

export default function RecipeSaveButton({ recipe, onSaveUpdated }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const controllerRef = useRef(null);

  const savedByMe = Boolean(recipe.savedByMe);
  const action = savedByMe ? "Remove from saved recipes" : "Save";

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
      const response = await fetch(`/api/saved-recipes/${recipe._id}`, {
        method: savedByMe ? "DELETE" : "PUT",
        credentials: "include",
        signal: controller.signal
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to update this saved recipe.");
      }

      if (!controller.signal.aborted) {
        onSaveUpdated(recipe._id, { savedByMe: data.saved });
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

  return (
    <div className="recipe-save-control">
      <button
        className={savedByMe ? "recipe-save-button is-saved" : "recipe-save-button"}
        type="button"
        onClick={handleClick}
        disabled={pending}
        aria-pressed={savedByMe}
        aria-label={`${action} ${recipe.title}`}
        aria-busy={pending}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M6 3.75h12v16.5L12 17l-6 3.25V3.75Z" />
        </svg>
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
