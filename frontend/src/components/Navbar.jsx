import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import ProfileAvatar from "./ProfileAvatar";

const secondaryPages = [
    { to: "/my-recipes", label: "My Recipes" },
    { to: "/offline-recipes", label: "Offline Recipes" },
    { to: "/profile", label: "My Profile" },
    { to: "/people", label: "Find People" }
];

function NavIcon({ name }) {
    const shared = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, focusable: false };
    switch (name) {
        case "home": return <svg {...shared}><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" /></svg>;
        case "planner": return <svg {...shared}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 10h18M8 14h3m-3 4h6" /></svg>;
        case "pantry": return <svg {...shared}><path d="M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17M3 21h18M5 11h14M9 7h3m-3 8h3m3 0h1" /></svg>;
        case "saved": return <svg {...shared}><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" /></svg>;
        case "menu": return <svg {...shared}><path d="M4 6h16M4 12h16M4 18h16" /></svg>;
        case "search": return <svg {...shared}><circle cx="10.8" cy="10.8" r="6.3" /><path d="m15.5 15.5 5 5" /></svg>;
        case "close": return <svg {...shared}><path d="M5 5l14 14M19 5 5 19" /></svg>;
        default: return null;
    }
}

function NavbarSearch({ onSubmitComplete }) {
    const location = useLocation();
    const navigate = useNavigate();
    const currentSearch = new URLSearchParams(location.search).get("search") || "";
    const [searchInput, setSearchInput] = useState(currentSearch);
    const [mode, setMode] = useState(location.pathname === "/people" ? "people" : "recipes");

    function submitSearch(event) {
        event.preventDefault();
        const search = searchInput.trim();
        onSubmitComplete?.();

        if (mode === "people") {
            navigate({ pathname: "/people", search: search ? `?search=${encodeURIComponent(search)}` : "" });
            return;
        }

        const params = location.pathname === "/"
            ? new URLSearchParams(location.search)
            : new URLSearchParams();
        if (search) {
            params.set("search", search);
            params.delete("searchMode");
        } else {
            params.delete("search");
            params.delete("searchMode");
        }
        navigate({ pathname: "/", search: params.toString() ? `?${params.toString()}` : "" });
    }

    function clearSearch() {
        setSearchInput("");
        if (location.pathname !== "/" && location.pathname !== "/people") return;
        const params = new URLSearchParams(location.search);
        params.delete("search");
        params.delete("searchMode");
        navigate({ pathname: location.pathname, search: params.toString() ? `?${params.toString()}` : "" });
    }

    return (
        <form id="culinary-site-search" className="site-search" role="search" onSubmit={submitSearch}>
            <label className="visually-hidden" htmlFor="site-search-input">Search Culinary</label>
            <input
                id="site-search-input"
                type="search"
                placeholder="Search recipes or cooks…"
                value={searchInput}
                maxLength={100}
                onChange={(event) => setSearchInput(event.target.value)}
            />
            <select
                className="site-search-mode"
                value={mode}
                onChange={(event) => setMode(event.target.value)}
                aria-label="Search for"
            >
                <option value="recipes">Recipes</option>
                <option value="people">People</option>
            </select>
            {searchInput && (
                <button className="site-search-clear" type="button" onClick={clearSearch} aria-label="Clear search">
                    <span aria-hidden="true">×</span>
                </button>
            )}
            <button className="site-search-submit" type="submit" aria-label="Submit search">
                <NavIcon name="search" />
            </button>
        </form>
    );
}

export default function Navbar({ user, onLogout, loggingOut, logoutError }) {
    const location = useLocation();
    const [unread, setUnread] = useState(0);
    const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
    const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
    const searchToggleRef = useRef(null);
    const moreToggleRef = useRef(null);
    const closeMoreRef = useRef(null);
    const morePanelRef = useRef(null);
    const desktopMoreRef = useRef(null);
    const previousPathRef = useRef(location.pathname);

    useEffect(() => {
        let active = true;
        async function load() {
            try {
                const response = await fetch("/api/notifications/unread-count", { credentials: "include" });
                if (response.ok && active) {
                    const data = await response.json();
                    setUnread(Number(data.count) || 0);
                }
            } catch { /* Offline: preserve the most recently shown count. */ }
        }
        load();
        const timer = window.setInterval(() => { if (!document.hidden) load(); }, 60000);
        return () => { active = false; window.clearInterval(timer); };
    }, [location.pathname]);

    // Also dismiss overlays when browser back/forward changes the route.
    useEffect(() => {
        if (previousPathRef.current !== location.pathname) {
            previousPathRef.current = location.pathname;
            setMobileMoreOpen(false);
            setMobileSearchOpen(false);
            if (desktopMoreRef.current) desktopMoreRef.current.open = false;
        }
    }, [location.pathname]);

    useEffect(() => {
        if (mobileSearchOpen) document.getElementById("site-search-input")?.focus();
    }, [mobileSearchOpen]);

    useEffect(() => {
        if (!mobileMoreOpen) return undefined;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        closeMoreRef.current?.focus();
        function handleEscape(event) {
            if (event.key === "Escape") {
                setMobileMoreOpen(false);
                moreToggleRef.current?.focus();
            }
        }
        document.addEventListener("keydown", handleEscape);
        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener("keydown", handleEscape);
        };
    }, [mobileMoreOpen]);

    function closeMobileMore() {
        setMobileMoreOpen(false);
    }

    function trapMoreFocus(event) {
        if (event.key !== "Tab") return;
        const focusable = morePanelRef.current?.querySelectorAll('a[href], button:not([disabled])');
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault(); first.focus();
        }
    }

    const moreIsActive = ["/my-recipes", "/offline-recipes", "/profile", "/people", "/users"].some((path) => location.pathname.startsWith(path));

    return (
        <>
            <header className={`site-header ${mobileSearchOpen ? "mobile-search-open" : ""}`}>
                <div className="site-header-inner">
                    <Link className="brand" to="/" onClick={() => setMobileSearchOpen(false)}>
                        Culinary
                    </Link>

                    <NavbarSearch key={`${location.pathname}${location.search}`} onSubmitComplete={() => setMobileSearchOpen(false)} />

                    <nav className="site-nav" aria-label="Desktop navigation">
                        <NavLink to="/" end>Discover</NavLink>
                        <NavLink to="/my-recipes">My Recipes</NavLink>
                        <NavLink to="/saved-recipes">Saved</NavLink>
                        <NavLink to="/meal-planner">Planner</NavLink>
                        <NavLink to="/pantry">Pantry</NavLink>
                        <details className="site-nav-more" ref={desktopMoreRef} onKeyDown={(event) => { if (event.key === "Escape") desktopMoreRef.current.open = false; }}>
                            <summary>More <span aria-hidden="true">⌄</span></summary>
                            <div className="site-nav-dropdown">
                                <NavLink to="/offline-recipes" onClick={() => { desktopMoreRef.current.open = false; }}>Offline Recipes</NavLink>
                                <NavLink to="/profile" onClick={() => { desktopMoreRef.current.open = false; }}>My Profile</NavLink>
                                <NavLink to="/people" onClick={() => { desktopMoreRef.current.open = false; }}>Find People</NavLink>
                            </div>
                        </details>
                    </nav>

                    <div className="site-header-actions">
                        <button
                            ref={searchToggleRef}
                            className="mobile-search-toggle"
                            type="button"
                            aria-label={mobileSearchOpen ? "Close search" : "Open search"}
                            aria-expanded={mobileSearchOpen}
                            aria-controls="culinary-site-search"
                            onClick={() => setMobileSearchOpen((open) => !open)}
                        >
                            <NavIcon name={mobileSearchOpen ? "close" : "search"} />
                        </button>
                        <Link className="notification-bell" to="/notifications" aria-label={`${unread} unread notifications`}>
                            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                                <path d="M18 10a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
                                <path d="M10 21h4" />
                            </svg>
                            {unread > 0 && <span>{unread > 99 ? "99+" : unread}</span>}
                        </Link>
                        <Link className="mobile-avatar-link" to="/profile" aria-label="My profile">
                            <ProfileAvatar className="account-avatar" imageUrl={user.profilePhotoUrl} name={user.displayName || user.username} decorative />
                        </Link>
                        <div className="site-account">
                            <Link className="account-avatar-link" to="/profile" aria-label="Open my profile">
                                <ProfileAvatar className="account-avatar" imageUrl={user.profilePhotoUrl} name={user.displayName || user.username} decorative />
                            </Link>
                            <button type="button" onClick={onLogout} disabled={loggingOut}>
                                {loggingOut ? "Logging out…" : "Log out"}
                            </button>
                        </div>
                    </div>
                </div>
                {logoutError && <div className="site-header-error"><p role="alert">{logoutError}</p></div>}
            </header>

            <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
                <NavLink to="/" end onClick={closeMobileMore}><NavIcon name="home" /><span>Home</span></NavLink>
                <NavLink to="/meal-planner" onClick={closeMobileMore}><NavIcon name="planner" /><span>Planner</span></NavLink>
                <NavLink to="/pantry" onClick={closeMobileMore}><NavIcon name="pantry" /><span>Pantry</span></NavLink>
                <NavLink to="/saved-recipes" onClick={closeMobileMore}><NavIcon name="saved" /><span>Saved</span></NavLink>
                <button
                    ref={moreToggleRef}
                    className={mobileMoreOpen || moreIsActive ? "mobile-more-active" : ""}
                    type="button"
                    aria-expanded={mobileMoreOpen}
                    aria-controls="culinary-mobile-more"
                    onClick={() => setMobileMoreOpen((open) => !open)}
                ><NavIcon name="menu" /><span>More</span></button>
            </nav>

            {mobileMoreOpen && (
                <div className="mobile-more-layer">
                    <button className="mobile-more-backdrop" type="button" aria-label="Close navigation menu" onClick={closeMobileMore} />
                    <section id="culinary-mobile-more" className="mobile-more-panel" role="dialog" aria-modal="true" aria-labelledby="mobile-more-title" ref={morePanelRef} onKeyDown={trapMoreFocus}>
                        <div className="mobile-more-heading">
                            <h2 id="mobile-more-title">Explore Culinary</h2>
                            <button ref={closeMoreRef} type="button" className="mobile-more-close" onClick={() => { closeMobileMore(); moreToggleRef.current?.focus(); }} aria-label="Close menu"><NavIcon name="close" /></button>
                        </div>
                        <nav aria-label="More pages" className="mobile-more-links">
                            {secondaryPages.map(({ to, label }) => (
                                <NavLink key={to} to={to} onClick={closeMobileMore}>{label}<span aria-hidden="true">→</span></NavLink>
                            ))}
                            <NavLink to="/notifications" onClick={closeMobileMore}>Notifications<span aria-hidden="true">→</span></NavLink>
                        </nav>
                        <button className="mobile-more-logout" type="button" onClick={() => { closeMobileMore(); onLogout(); }} disabled={loggingOut}>
                            {loggingOut ? "Logging out…" : "Log out"}
                        </button>
                    </section>
                </div>
            )}
        </>
    );
}
