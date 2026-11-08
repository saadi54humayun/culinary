import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import ProfileAvatar from "../components/ProfileAvatar";

/** A directory entry intentionally doesn't call the search API until there is a query. */
export default function People({ user }) {
  const [params, setParams] = useSearchParams();
  const query = (params.get("search") || "").trim();
  const validQuery = query.length >= 1 && query.length <= 100;
  const [draft, setDraft] = useState(query);
  const [people, setPeople] = useState([]);
  const [page, setPage] = useState({ query: "", cursor: null });
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [followBusy, setFollowBusy] = useState("");

  const cursor = page.query === query ? page.cursor : null;

  useEffect(() => { setDraft(query); }, [query]);

  useEffect(() => {
    if (!validQuery) {
      // Do not send /api/users/search?search= — the backend explicitly rejects it.
      return undefined;
    }
    const controller = new AbortController();
    const firstPage = !cursor;
    async function load() {
      setLoading(true);
      setError("");
      if (firstPage) { setPeople([]); setNextCursor(null); }
      try {
        const q = new URLSearchParams({ search: query });
        if (cursor) q.set("cursor", cursor);
        const response = await fetch(`/api/users/search?${q}`, { credentials: "include", signal: controller.signal });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || "Unable to search cooks.");
        if (controller.signal.aborted) return;
        setPeople((old) => firstPage ? (data.users || []) : [...old, ...(data.users || []).filter((person) => !old.some((p) => p.id === person.id))]);
        setNextCursor(data.nextCursor || null);
      } catch (err) {
        if (!controller.signal.aborted) setError(err.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, [query, cursor, validQuery]);

  function submit(event) {
    event.preventDefault();
    const next = draft.trim();
    if (next.length < 1 || next.length > 100) { setError("Enter between 1 and 100 characters."); return; }
    setError("");
    setPage({ query: next, cursor: null });
    setParams({ search: next });
  }

  async function follow(person) {
    if (followBusy) return;
    setFollowBusy(person.id);
    setError("");
    try {
      const response = await fetch(`/api/users/${encodeURIComponent(person.username)}/follow`, {
        method: person.isFollowing ? "DELETE" : "PUT", credentials: "include"
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || "Couldn't update your follow status.");
      }
      setPeople((old) => old.map((p) => p.id === person.id ? { ...p, isFollowing: !p.isFollowing } : p));
    } catch (err) { setError(err.message); }
    finally { setFollowBusy(""); }
  }

  return (
    <main className="main-content people-page">
      <section className="people-intro">
        <p className="eyebrow">THE CULINARY COMMUNITY</p>
        <h1>Find your people</h1>
        <p>Meet home cooks, discover their recipes, and follow the creators you enjoy.</p>
      </section>
      <form className="people-search-form" role="search" onSubmit={submit}>
        <label htmlFor="people-search">Search by name or username</label>
        <div className="people-search-controls">
          <input id="people-search" type="search" autoComplete="off" maxLength={100}
            value={draft} onChange={(event) => setDraft(event.target.value)}
            placeholder="Try a cook's name or username" />
          <button className="primary-button" type="submit" disabled={!draft.trim()}>Find cooks</button>
        </div>
      </form>
      {error && <p className="people-feedback-error" role="alert">{error}</p>}
      {!query ? (
        <section className="people-start-state">
          <span aria-hidden="true" className="people-start-icon">✳</span>
          <h2>Great recipes start with people.</h2>
          <p>Enter a name above to discover cooks. You can also find creators through the Discover feed.</p>
          <Link className="primary-button" to="/">Explore recipes</Link>
        </section>
      ) : !validQuery ? (
        <p role="alert">Enter between 1 and 100 characters to search.</p>
      ) : (
        <section aria-label="Search results">
          <h2 className="people-results-title">Cooks matching “{query}”</h2>
          {loading && people.length === 0 && <p role="status">Searching cooks…</p>}
          {!loading && !error && people.length === 0 && (
            <div className="people-start-state"><h3>No cooks found</h3><p>Try a shorter name, a different username, or browse Discover.</p></div>
          )}
          <div className="people-list">
            {people.map((person) => (
              <article className="person-row" key={person.id}>
                <ProfileAvatar className="person-avatar" imageUrl={person.profilePhotoUrl} name={person.displayName || person.username} />
                <div className="person-details">
                  <Link to={`/users/${encodeURIComponent(person.username)}`}>{person.displayName || person.username}</Link>
                  <p>@{person.username}</p>
                  {person.bio && <p>{person.bio}</p>}
                </div>
                {String(person.id) !== String(user?.id || user?._id) && (
                  <button type="button" onClick={() => follow(person)} disabled={Boolean(followBusy)}>
                    {followBusy === person.id ? "Saving…" : person.isFollowing ? "Following" : "Follow"}
                  </button>
                )}
              </article>
            ))}
          </div>
          {nextCursor && (
            <button className="people-load-more" type="button" onClick={() => setPage({ query, cursor: nextCursor })} disabled={loading}>
              {loading ? "Loading…" : "Load more cooks"}
            </button>
          )}
        </section>
      )}
    </main>
  );
}
