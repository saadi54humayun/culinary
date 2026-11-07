import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short"
});

function authorName(author) {
  return author?.displayName || author?.username || "Deleted user";
}

function authorInitial(author) {
  return authorName(author).charAt(0).toUpperCase() || "?";
}

function formatDate(date) {
  try {
    return dateFormatter.format(new Date(date));
  } catch {
    return "Unknown date";
  }
}

export default function RecipeComments({ recipeId, currentUserId, compact = false, onCommentsCountChange }) {
  const [comments, setComments] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState("");
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const loadMoreControllerRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadComments() {
      setLoading(true);
      setError("");
      setLoadMoreError("");
      setComments([]);
      setNextCursor(null);

      try {
        const response = await fetch(`/api/recipes/${recipeId}/comments`, {
          credentials: "include",
          signal: controller.signal
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Unable to load comments.");
        }

        if (!controller.signal.aborted) {
          setComments(data.comments);
          setNextCursor(data.nextCursor);
        }
      } catch (requestError) {
        if (!controller.signal.aborted) {
          setError(requestError.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadComments();

    return () => controller.abort();
  }, [recipeId, retryCount]);

  useEffect(() => {
    return () => loadMoreControllerRef.current?.abort();
  }, [recipeId]);

  async function handleSubmit(event) {
    event.preventDefault();
    setPostError("");

    const trimmedText = text.trim();

    if (!trimmedText) {
      setPostError("Write a comment before posting.");
      return;
    }

    setPosting(true);

    try {
      const response = await fetch(`/api/recipes/${recipeId}/comments`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ text: trimmedText })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to post your comment.");
      }

      setComments((previous) => {
        if (previous.some((comment) => comment._id === data.comment._id)) {
          return previous;
        }

        return [data.comment, ...previous];
      });
      onCommentsCountChange?.(1);
      setText("");
    } catch (requestError) {
      setPostError(requestError.message);
    } finally {
      setPosting(false);
    }
  }

  async function handleLoadMore() {
    if (loadingMore || !nextCursor) return;

    const controller = new AbortController();
    loadMoreControllerRef.current = controller;
    setLoadingMore(true);
    setLoadMoreError("");

    try {
      const query = new URLSearchParams({ cursor: nextCursor });
      const response = await fetch(
        `/api/recipes/${recipeId}/comments?${query}`,
        {
          credentials: "include",
          signal: controller.signal
        }
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to load more comments.");
      }

      if (controller.signal.aborted) return;

      setComments((previous) => {
        const existingIds = new Set(
          previous.map((comment) => comment._id)
        );

        return [
          ...previous,
          ...data.comments.filter(
            (comment) => !existingIds.has(comment._id)
          )
        ];
      });
      setNextCursor(data.nextCursor);
    } catch (requestError) {
      if (!controller.signal.aborted) {
        setLoadMoreError(requestError.message);
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoadingMore(false);
      }
    }
  }

  async function handleDelete(commentId) {
    if (deletingId) return;

    const confirmed = window.confirm(
      "Delete this comment? This cannot be undone."
    );

    if (!confirmed) return;

    setDeletingId(commentId);
    setDeleteError("");

    try {
      const response = await fetch(
        `/api/recipes/${recipeId}/comments/${commentId}`,
        {
          method: "DELETE",
          credentials: "include"
        }
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to delete this comment.");
      }

      setComments((previous) =>
        previous.filter((comment) => comment._id !== commentId)
      );
      onCommentsCountChange?.(-1);
    } catch (requestError) {
      setDeleteError(requestError.message);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className={compact ? "recipe-comments recipe-comments-compact" : "recipe-comments"} aria-labelledby={`comments-heading-${recipeId}`}>
      <h2 id={`comments-heading-${recipeId}`} className={compact ? "visually-hidden" : ""}>Comments</h2>

      <form className="comment-form" onSubmit={handleSubmit}>
        <label htmlFor="comment-text">Join the conversation</label>
        <textarea
          id="comment-text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={1000}
          rows={4}
          placeholder="Share a cooking tip or ask a question..."
          aria-describedby="comment-character-count"
          disabled={posting}
        />
        <div className="comment-form-actions">
          <span id="comment-character-count" aria-live="polite">
            {text.length}/1000 characters
          </span>
          <button className="primary-button" type="submit" disabled={posting}>
            {posting ? "Posting…" : "Post comment"}
          </button>
        </div>
        {postError && <p role="alert">{postError}</p>}
      </form>

      {loading && <p role="status">Loading comments…</p>}

      {!loading && error && (
        <div className="comments-retry">
          <p role="alert">{error}</p>
          <button type="button" onClick={() => setRetryCount((count) => count + 1)}>
            Retry
          </button>
        </div>
      )}

      {!loading && !error && comments.length === 0 && (
        <p className="comments-empty">No comments yet. Start the conversation.</p>
      )}

      {!loading && !error && comments.length > 0 && (
        <ul className="comment-list">
          {comments.map((comment) => {
            const isOwnComment = String(comment.author?._id) === String(currentUserId);
            const name = authorName(comment.author);

            return (
              <li className="comment-item" key={comment._id}>
                {comment.author?.profilePhotoUrl ? (
                  <img
                    className="comment-avatar"
                    src={comment.author.profilePhotoUrl}
                    alt={`${name}'s profile`}
                  />
                ) : (
                  <div className="comment-avatar comment-avatar-placeholder" aria-hidden="true">
                    {authorInitial(comment.author)}
                  </div>
                )}

                <div className="comment-content">
                  <div className="comment-meta">
                    {comment.author?.username ? (
                      <Link to={`/users/${encodeURIComponent(comment.author.username)}`}>
                        {name}
                      </Link>
                    ) : (
                      <span>{name}</span>
                    )}
                    {comment.author?.username && (
                      <span>@{comment.author.username}</span>
                    )}
                    <time dateTime={comment.createdAt}>
                      {formatDate(comment.createdAt)}
                    </time>
                  </div>
                  <div className="comment-text">{comment.text}</div>

                  {isOwnComment && (
                    <button
                      className="comment-delete-button"
                      type="button"
                      onClick={() => handleDelete(comment._id)}
                      disabled={deletingId !== null}
                    >
                      {deletingId === comment._id ? "Deleting…" : "Delete"}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {deleteError && <p role="alert">{deleteError}</p>}

      {!loading && !error && nextCursor && (
        <div className="comments-load-more">
          {loadMoreError && <p role="alert">{loadMoreError}</p>}
          <button
            type="button"
            onClick={handleLoadMore}
            disabled={loadingMore}
          >
            {loadingMore
              ? "Loading comments…"
              : loadMoreError
                ? "Retry loading more"
                : "Load more comments"}
          </button>
        </div>
      )}
    </section>
  );
}
