import { useEffect, useState } from "react";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import "./App.css";
import "./ui-polish.css";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import Profile from "./pages/Profile";
import Signup from "./pages/Signup";
import Feed from "./pages/Feed";
import RecipeDetails from "./pages/RecipeDetails";
import CookingMode from "./pages/CookingMode";
import Navbar from "./components/Navbar";
import SavedRecipes from "./pages/SavedRecipes";
import MealPlanner from "./pages/MealPlanner";
import Pantry from "./pages/Pantry";
import PublicProfile from "./pages/PublicProfile";
import Notifications from "./pages/Notifications";
import People from "./pages/People";
import Connections from "./pages/Connections";
import VerifyEmail from "./pages/VerifyEmail";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import OfflineRecipes, { OfflineRecipeDetails } from "./pages/OfflineRecipes";
import { rememberedOfflineUser, rememberOfflineUser, clearOfflineAccount, syncAllOfflineProgress } from "./offline/storage";

export default function App() {
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [offlineOnly, setOfflineOnly] = useState(false);
  const [sessionError, setSessionError] = useState("");
  const [logoutError, setLogoutError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);

  const location = useLocation();

  useEffect(() => {
    const controller = new AbortController();

    async function checkSession() {
      try {
        const response = await fetch("/api/auth/me", {
          credentials: "include",
          signal: controller.signal
        });

        if (response.status === 401) {
          rememberOfflineUser(null); // Authenticated server response overrides local offline identity.
          setUser(null);
          return;
        }

        if (!response.ok) {
          throw new Error("Unable to check your session.");
        }

        const data = await response.json();
        rememberOfflineUser(data.user);
        setUser(data.user);
        setOfflineOnly(false);
        syncAllOfflineProgress(data.user.id || data.user._id).catch(() => {});
      } catch {
        if (!controller.signal.aborted) {
          const localUser = rememberedOfflineUser();
          if (localUser) {
            setUser(localUser);
            setOfflineOnly(true);
          } else {
            setSessionError("Cannot check your session. Connect to the internet and sign in once before downloading recipes for offline use.");
          }
        }
      } finally {
        if (!controller.signal.aborted) {
          setCheckingSession(false);
        }
      }
    }

    checkSession();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (user && !offlineOnly) rememberOfflineUser(user);
  }, [user, offlineOnly]);

  useEffect(() => {
    if (!user) return;
    const reconnect = async () => {
      if (!navigator.onLine) return;
      if (offlineOnly) {
        try {
          const response = await fetch("/api/auth/me", { credentials: "include" });
          if (!response.ok) return;
          const data = await response.json();
          // Only the same account is allowed to resume this offline session.
          if (String(data.user.id || data.user._id) !== String(user.id || user._id)) return;
          rememberOfflineUser(data.user);
          setUser(data.user);
          setOfflineOnly(false);
        } catch { return; }
      }
      syncAllOfflineProgress(user.id || user._id).catch(() => {});
    };
    window.addEventListener("online", reconnect);
    return () => window.removeEventListener("online", reconnect);
  }, [user, offlineOnly]);

  async function handleLogout() {
    setLoggingOut(true);
    setLogoutError("");

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include"
      });

      if (!response.ok) {
        throw new Error("Logout failed. Please try again.");
      }

      // A signed-out person must not be able to open the previous user's downloads.
      rememberOfflineUser(null);
      setUser(null);
      try { await clearOfflineAccount(user.id || user._id); }
      catch { setLogoutError("Signed out, but could not clear all offline downloads. Clear site data on shared devices."); }
    } catch (error) {
      setLogoutError(error.message);
    } finally {
      setLoggingOut(false);
    }
  }

  if (checkingSession) {
    return <p className="main-content">Checking your session…</p>;
  }

  if (sessionError) {
    return (
      <main className="main-content">
        <p role="alert">{sessionError}</p>
        <button onClick={() => window.location.reload()}>
          Retry
        </button>
      </main>
    );
  }

  const requestedPath = location.state?.from;
  const destination =
    typeof requestedPath === "string" &&
      requestedPath.startsWith("/") &&
      !requestedPath.startsWith("//") &&
      !["/login", "/signup"].includes(requestedPath.split("?")[0])
      ? requestedPath
      : "/";

  if (offlineOnly && user) {
    async function removeOfflineAccess() {
      if (!window.confirm("Remove all offline Culinary downloads for this account from this device?")) return;
      try {
        await clearOfflineAccount(user.id || user._id);
        setUser(null);
        setOfflineOnly(false);
        setSessionError("Offline downloads removed. Reconnect to sign in again.");
      } catch (error) { window.alert(`Unable to clear local downloads: ${error.message}`); }
    }
    return <>
      <header className="offline-app-header" style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", padding: "12px 18px", background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
        <strong>Culinary · Offline</strong>
        <a href="/offline-recipes">Downloaded recipes</a>
        <button type="button" onClick={() => window.location.reload()}>Try reconnecting</button>
        <button type="button" onClick={removeOfflineAccess}>Remove offline data</button>
      </header>
      <Routes>
        <Route path="/offline-recipes" element={<OfflineRecipes user={user} offlineOnly />} />
        <Route path="/offline-recipes/:id" element={<OfflineRecipeDetails user={user} />} />
        <Route path="/recipes/:id/cook" element={<CookingMode user={user} offlineOnly />} />
        <Route path="*" element={<Navigate to="/offline-recipes" replace />} />
      </Routes>
    </>;
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login onLogin={setUser} />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route
          path="*"
          element={
            <Navigate
              to="/login"
              replace
              state={{
                from: location.pathname + location.search
              }}
            />
          }
        />

      </Routes>
    );
  }

  return (
    <div className="app-shell">
      <Navbar
        user={user}
        onLogout={handleLogout}
        loggingOut={loggingOut}
        logoutError={logoutError}
      />

      <Routes>
        <Route path="/" element={<Feed key={location.search} user={user} />} />
        <Route path="/my-recipes" element={<Dashboard />} />

        <Route
          path="/profile"
          element={<Profile user={user} onUserUpdated={setUser} />}
        />

        <Route
          path="/login"
          element={<Navigate to={destination} replace />}
        />
        <Route path="/signup" element={<Navigate to="/" replace />} />
        <Route path="/recipes/:id" element={<RecipeDetails user={user} />} />
        <Route path="/recipes/:id/cook" element={<CookingMode user={user} />} />
        <Route path="/saved-recipes" element={<SavedRecipes />} />
        <Route path="/offline-recipes" element={<OfflineRecipes user={user} />} />
        <Route path="/offline-recipes/:id" element={<OfflineRecipeDetails user={user} />} />
        <Route path="/meal-planner" element={<MealPlanner user={user} />} />
        <Route path="/pantry" element={<Pantry />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/people" element={<People user={user} />} />
        <Route path="/users/:username/:type" element={<Connections user={user} />} />
        <Route path="/users/:username" element={<PublicProfile user={user} />} />

        <Route
          path="*"
          element={
            <main className="main-content">
              <p>Page not found.</p>
            </main>
          }
        />
      </Routes>
    </div>
  );
}
