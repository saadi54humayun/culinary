import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

export default function Signup() {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ username, email, password })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to create your account.");
      }

      const challenge = data.challenge?.challengeId;
      navigate(challenge ? `/verify-email?challenge=${encodeURIComponent(challenge)}` : "/verify-email", {
        replace: true,
        state: { email, message: data.message }
      });
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Join Culinary</h1>

        <label htmlFor="signup-username">Username</label>
        <input
          id="signup-username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          autoComplete="username"
          minLength={3}
          maxLength={30}
          pattern="[a-zA-Z0-9_]{3,30}"
          title="Use 3–30 letters, numbers, or underscores."
          required
        />

        <label htmlFor="signup-email">Email</label>
        <input
          id="signup-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          maxLength={254}
          required
        />

        <label htmlFor="signup-password">Password</label>
        <input
          id="signup-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          minLength={15}
          maxLength={128}
          required
        />
        <p>Use between 15 and 128 characters.</p>

        {error && <p role="alert">{error}</p>}

        <button
          className="primary-button"
          type="submit"
          disabled={loading}
        >
          {loading ? "Creating account…" : "Create account"}
        </button>

        <p>
          Already registered? <Link to="/login">Log in</Link>
        </p>
      </form>
    </main>
  );
}
