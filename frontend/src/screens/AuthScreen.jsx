import { useState } from 'react';
import { dashboardRequest } from '../api.js';

export default function AuthScreen({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await dashboardRequest("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      onLogin(result);
    } catch (err) {
      setError(err?.message || "Не удалось войти");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100dvh", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#eef6ff", padding: 20 }}>
      <form onSubmit={handleSubmit} style={{ width: "100%", maxWidth: 420, background: "#fff", border: "1px solid #dbeafe", borderRadius: 8, boxShadow: "0 18px 48px rgba(30,58,110,.12)", padding: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <div style={{ width: 42, height: 42, borderRadius: 8, background: "linear-gradient(135deg, #2563eb, #60a5fa)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="22" height="22" viewBox="0 0 18 18" fill="none">
              <rect x="2" y="9" width="4" height="7" rx="1" fill="white"/>
              <rect x="7" y="5" width="4" height="11" rx="1" fill="white" opacity=".8"/>
              <rect x="12" y="2" width="4" height="14" rx="1" fill="white" opacity=".6"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#1e3a6e" }}>Вход в дашборд</div>
            <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>Рабочее пространство команды</div>
          </div>
        </div>

        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 7 }}>Email</label>
        <input
          value={email}
          onChange={e => setEmail(e.target.value)}
          type="email"
          autoComplete="email"
          required
          style={{ width: "100%", height: 42, border: "1.5px solid #dbeafe", borderRadius: 8, padding: "0 12px", fontFamily: "Inter", fontSize: 14, outline: "none", marginBottom: 16 }}
        />

        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 7 }}>Пароль</label>
        <input
          value={password}
          onChange={e => setPassword(e.target.value)}
          type="password"
          autoComplete="current-password"
          required
          style={{ width: "100%", height: 42, border: "1.5px solid #dbeafe", borderRadius: 8, padding: "0 12px", fontFamily: "Inter", fontSize: 14, outline: "none", marginBottom: 18 }}
        />

        {error && (
          <div style={{ padding: "10px 12px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", fontSize: 13, fontWeight: 600, marginBottom: 16 }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{ width: "100%", height: 44, border: "none", borderRadius: 8, background: loading ? "#93c5fd" : "linear-gradient(135deg,#2563eb,#3b82f6)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: loading ? "default" : "pointer", fontFamily: "Inter", boxShadow: "0 6px 16px rgba(37,99,235,.25)" }}
        >
          {loading ? "Входим..." : "Войти"}
        </button>
      </form>
    </div>
  );
}
