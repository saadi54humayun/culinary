import { useEffect, useState } from "react";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import "./App.css";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import Profile from "./pages/Profile";
import Signup from "./pages/Signup";
import Feed from "./pages/Feed";
import RecipeDetails from "./pages/RecipeDetails";
import Navbar from "./components/Navbar";
import SavedRecipes from "./pages/SavedRecipes";
import PublicProfile from "./pages/PublicProfile";
import Notifications from "./pages/Notifications";
import People from "./pages/People";
import Connections from "./pages/Connections";
import VerifyEmail from "./pages/VerifyEmail";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";

export default function App() {
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
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
          setUser(null);
          return;
        }

        if (!response.ok) {
          throw new Error("Unable to check your session.");
        }

        const data = await response.json();
        setUser(data.user);
      } catch {
        if (!controller.signal.aborted) {
          setSessionError(
            "Cannot check your session. Make sure the backend is running."
          );
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

      setUser(null);
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
    <>
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
        <Route path="/saved-recipes" element={<SavedRecipes />} />
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
    </>
  );
}
