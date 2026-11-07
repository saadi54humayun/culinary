import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  async function submit(event) {
    event.preventDefault(); setLoading(true);
    try {
      const response = await fetch("/api/auth/password-reset/request", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const data = await response.json();
      navigate("/reset-password", { state: { email, challengeId: data.challengeId, message: data.message } });
    } finally { setLoading(false); }
  }
  return <main className="auth-page"><form className="auth-card" onSubmit={submit}><h1>Reset your password</h1><p>We’ll send a recovery code if an account matches this email.</p><label htmlFor="recovery-email">Email</label><input id="recovery-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /><button className="primary-button" disabled={loading}>{loading ? "Sending…" : "Send recovery code"}</button><p><Link to="/login">Return to login</Link></p></form></main>;
}
