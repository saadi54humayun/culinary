import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import ProfileAvatar from "./ProfileAvatar";

function NavbarSearch() {
    const location = useLocation();
    const navigate = useNavigate();
    const submittedSearch = location.pathname === "/"
        ? new URLSearchParams(location.search).get("search") || ""
        : "";
    const [searchInput, setSearchInput] = useState(submittedSearch);
    const [mode, setMode] = useState(location.pathname === "/people" ? "people" : "recipes");

    function submitSearch(event) {
        event.preventDefault();

        const params = location.pathname === "/"
            ? new URLSearchParams(location.search)
            : new URLSearchParams();
        const search = searchInput.trim();

        if (mode === "people") {
            navigate({ pathname: "/people", search: search ? `?search=${encodeURIComponent(search)}` : "" });
            return;
        }

        if (search) {
            params.set("search", search);
            // A submitted recipe query always starts a fresh interpreted
            // search; title-only mode is an explicit error fallback only.
            params.delete("searchMode");
        } else {
            params.delete("search");
            params.delete("searchMode");
        }

        navigate({
            pathname: "/",
            search: params.toString() ? `?${params.toString()}` : ""
        });
    }

    function clearSearch() {
        setSearchInput("");

        if (location.pathname !== "/") return;

        const params = new URLSearchParams(location.search);
        params.delete("search");
        params.delete("searchMode");
        navigate({
            pathname: "/",
            search: params.toString() ? `?${params.toString()}` : ""
        });
    }

    return (
        <form className="site-search" role="search" onSubmit={submitSearch}>
            <label className="visually-hidden" htmlFor="site-search-input">
                Search recipes
            </label>
            <input
                id="site-search-input"
                type="search"
                placeholder="Search recipes..."
                value={searchInput}
                maxLength={100}
                onChange={(event) => setSearchInput(event.target.value)}
            />
            <select className="site-search-mode" value={mode} onChange={(event) => setMode(event.target.value)} aria-label="Search mode"><option value="recipes">Recipes</option><option value="people">People</option></select>
            {searchInput && (
                <button
                    className="site-search-clear"
                    type="button"
                    onClick={clearSearch}
                    aria-label="Clear recipe search"
                >
                    <span aria-hidden="true">×</span>
                </button>
            )}
            <button
                className="site-search-submit"
                type="submit"
                aria-label="Search recipes"
            >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <circle cx="10.75" cy="10.75" r="5.75" />
                    <path d="m15 15 4.25 4.25" />
                </svg>
            </button>
        </form>
    );
}

export default function Navbar({
    user,
    onLogout,
    loggingOut,
    logoutError
}) {
    const location = useLocation();
    const [unread, setUnread] = useState(0);

    useEffect(() => {
        let active = true;
        async function load() { const response = await fetch("/api/notifications/unread-count", { credentials: "include" }); if (response.ok && active) setUnread((await response.json()).count); }
        load(); const timer = setInterval(() => { if (!document.hidden) load(); }, 60000);
        return () => { active = false; clearInterval(timer); };
    }, [location.pathname]);

    return (
        <header className="site-header">
            <div className="site-header-inner">
                <Link className="brand" to="/">
                    Culinary
                </Link>

                <NavbarSearch key={`${location.pathname}${location.search}`} />

                <nav className="site-nav" aria-label="Main navigation">
                    <NavLink to="/" end>
                        Discover
                    </NavLink>

                    <NavLink to="/my-recipes">
                        My Recipes
                    </NavLink>
                    <NavLink to="/saved-recipes">
                        Saved Recipes
                    </NavLink>
                    <NavLink to="/meal-planner">
                        Meal Planner
                    </NavLink>
                    <NavLink to="/pantry">
                        My Pantry
                    </NavLink>
                    <NavLink to="/offline-recipes">Offline Recipes</NavLink>

                    <NavLink to="/profile">
                        My Profile
                    </NavLink>
                </nav>

                <Link className="notification-bell" to="/notifications" aria-label={`${unread} unread notifications`}>
                    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M18 10a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                        <path d="M10 21h4" />
                    </svg>
                    {unread > 0 && <span>{unread > 99 ? "99+" : unread}</span>}
                </Link>

                <div className="site-account">
                    <Link
                        className="account-avatar-link"
                        to="/profile"
                        aria-label="Open my profile"
                    >
                        <ProfileAvatar
                            className="account-avatar"
                            imageUrl={user.profilePhotoUrl}
                            name={user.displayName || user.username}
                            decorative
                        />
                    </Link>

                    <button
                        type="button"
                        onClick={onLogout}
                        disabled={loggingOut}
                    >
                        {loggingOut ? "Logging out…" : "Log out"}
                    </button>
                </div>
            </div>

            {logoutError && (
                <div className="site-header-error">
                    <p role="alert">{logoutError}</p>
                </div>
            )}
        </header>
    );
}
