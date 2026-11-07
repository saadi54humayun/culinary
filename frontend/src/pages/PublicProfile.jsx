import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import RecipeLikeButton from "../components/RecipeLikeButton";
import RecipeSaveButton from "../components/RecipeSaveButton";
import ProfileAvatar from "../components/ProfileAvatar";

export default function PublicProfile({ user }) {
  const { username } = useParams();

  // Changing the username starts a fresh profile view.
  return <ProfileView key={username} username={username} currentUser={user} />;
}

function ProfileView({ username, currentUser }) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [followPending, setFollowPending] = useState(false);
  const [followError, setFollowError] = useState("");
  const followControllerRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();

    async function fetchProfile() {
      try {
        const response = await fetch(
          `/api/users/${encodeURIComponent(username)}`,
          {
            credentials: "include",
            signal: controller.signal
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Unable to load profile.");
        }

        if (!controller.signal.aborted) {
          setProfile(data.user);
        }
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

    fetchProfile();

    return () => controller.abort();
  }, [username]);

  useEffect(() => {
    return () => followControllerRef.current?.abort();
  }, []);

  async function handleFollow() {
    if (!profile || followPending) return;

    const targetUsername = profile.username;
    const controller = new AbortController();
    followControllerRef.current = controller;
    setFollowPending(true);
    setFollowError("");

    try {
      const response = await fetch(
        `/api/users/${encodeURIComponent(targetUsername)}/follow`,
        {
          method: profile.isFollowing ? "DELETE" : "PUT",
          credentials: "include",
          signal: controller.signal
        }
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to update this follow.");
      }

      if (controller.signal.aborted) return;

      setProfile((previous) => {
        if (!previous || previous.username !== targetUsername) return previous;

        return {
          ...previous,
          isFollowing: data.isFollowing,
          followersCount: data.followersCount,
          followingCount: data.followingCount
        };
      });
    } catch (requestError) {
      if (!controller.signal.aborted) {
        setFollowError(requestError.message);
      }
    } finally {
      if (!controller.signal.aborted) {
        setFollowPending(false);
      }
    }
  }

  return (
    <main className="main-content profile-page">
      <Link to="/">← Back to feed</Link>

      {loading && <p role="status">Loading profile…</p>}

      {error && (
        <div>
          <p role="alert">{error}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && profile && (
        <>
          <section className="profile-header-card public-profile-header">
            <div className="profile-identity">
              <ProfileAvatar
                className="profile-avatar"
                imageUrl={profile.profilePhotoUrl}
                name={profile.displayName || profile.username}
              />

              <div className="profile-identity-copy">
                <h1>{profile.displayName || profile.username}</h1>
                <p className="profile-username">@{profile.username}</p>
                <p className="profile-counts"><Link to={`/users/${encodeURIComponent(profile.username)}/followers`}>{profile.followersCount} {profile.followersCount === 1 ? "follower" : "followers"}</Link>{" · "}<Link to={`/users/${encodeURIComponent(profile.username)}/following`}>{profile.followingCount} following</Link></p>
                <p className={profile.bio ? "profile-bio" : "profile-bio profile-bio-empty"}>
                  {profile.bio || "This cook hasn’t added a bio yet."}
                </p>
              </div>
            </div>

            {profile.id !== currentUser.id && (
              <div className="profile-header-actions profile-follow-action">
                <button
                  type="button"
                  className={profile.isFollowing ? "" : "primary-button"}
                  onClick={handleFollow}
                  disabled={followPending}
                >
                  {followPending
                    ? profile.isFollowing ? "Unfollowing…" : "Following…"
                    : profile.isFollowing ? "Unfollow" : "Follow"}
                </button>
                {followError && <p role="alert">{followError}</p>}
              </div>
            )}
          </section>

          <AuthorRecipes authorId={profile.id} />
        </>
      )}
    </main>
  );
}

function AuthorRecipes({ authorId }) {
  const [recipes, setRecipes] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

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

  useEffect(() => {
    const controller = new AbortController();

    async function fetchRecipes() {
      setLoading(true);
      setError("");

      try {
        const query = new URLSearchParams({ author: authorId });

        if (cursor) {
          query.set("cursor", cursor);
        }

        const response = await fetch(`/api/recipes?${query}`, {
          credentials: "include",
          signal: controller.signal
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || "Unable to load recipes.");
        }

        if (controller.signal.aborted) return;

        setRecipes((previous) => {
          if (!cursor) return data.recipes;

          const existingIds = new Set(
            previous.map((recipe) => recipe._id)
          );

          return [
            ...previous,
            ...data.recipes.filter(
              (recipe) => !existingIds.has(recipe._id)
            )
          ];
        });

        setNextCursor(data.nextCursor);
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
  }, [authorId, cursor, retryCount]);

  return (
    <section className="public-profile-recipes">
      <h2>Published recipes</h2>

      {!loading && !error && recipes.length === 0 && (
        <p>This cook hasn’t published any recipes yet.</p>
      )}

      <div className="recipe-list">
        {recipes.map((recipe) => (
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
              <p className="recipe-author">
                By {recipe.author?.displayName || recipe.author?.username || "Unknown author"}
              </p>
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

            <p>
              Prep: {recipe.prepTimeMinutes} minutes · Cook:{" "}
              {recipe.cookTimeMinutes} minutes
            </p>

            <p>Servings: {recipe.servings}</p>
          </article>
        ))}
      </div>

      <div className="feed-pagination">
        {loading && <p role="status">Loading recipes…</p>}

        {!loading && error && (
          <>
            <p role="alert">{error}</p>
            <button
              type="button"
              onClick={() => setRetryCount((previous) => previous + 1)}
            >
              Retry
            </button>
          </>
        )}

        {!loading && !error && nextCursor && (
          <button
            type="button"
            className="primary-button"
            onClick={() => setCursor(nextCursor)}
          >
            Load more
          </button>
        )}
      </div>
    </section>
  );
}
