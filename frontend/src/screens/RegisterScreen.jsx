import { useState, useEffect } from 'react';
import { dashboardRequest } from '../api.js';

export default function RegisterScreen({ inviteToken, onLogin }) {
  const [invite, setInvite] = useState(null);
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadInvite() {
      setLoading(true);
      setError("");
      try {
        const data = await dashboardRequest(`/auth/invites/${inviteToken}`);
        if (!cancelled) setInvite(data);
      } catch (err) {
        if (!cancelled) setError(err?.message || "Приглашение недоступно");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadInvite();
    return () => { cancelled = true; };
  }, [inviteToken]);

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const result = await dashboardRequest("/auth/register", {
        method: "POST",
        body: JSON.stringify({ token: inviteToken, displayName, password }),
      });
      window.history.replaceState({}, "", "/");
      onLogin(result);
    } catch (err) {
      setError(err?.message || "Не удалось зарегистрироваться");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ minHeight: "100dvh", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#eef6ff", padding: 20 }}>
      <form onSubmit={handleSubmit} style={{ width: "100%", maxWidth: 440, background: "#fff", border: "1px solid #dbeafe", borderRadius: 8, boxShadow: "0 18px 48px rgba(30,58,110,.12)", padding: 28 }}>
        <div style={{ fontSize: 20, fontWeight: 700, color: "#1e3a6e", marginBottom: 6 }}>Регистрация по приглашению</div>
        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 22 }}>
          {loading ? "Проверяем приглашение..." : invite ? `Аккаунт для ${invite.email}` : "Приглашение не активно"}
        </div>
        {invite && (
          <>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 7 }}>Имя</label>
            <input value={displayName} onChange={e => setDisplayName(e.target.value)} required autoComplete="name" style={{ width: "100%", height: 42, border: "1.5px solid #dbeafe", borderRadius: 8, padding: "0 12px", fontFamily: "Inter", fontSize: 14, outline: "none", marginBottom: 16 }} />
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 7 }}>Пароль</label>
            <input value={password} onChange={e => setPassword(e.target.value)} type="password" required minLength={10} autoComplete="new-password" style={{ width: "100%", height: 42, border: "1.5px solid #dbeafe", borderRadius: 8, padding: "0 12px", fontFamily: "Inter", fontSize: 14, outline: "none", marginBottom: 18 }} />
          </>
        )}
        {error && <div style={{ padding: "10px 12px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", fontSize: 13, fontWeight: 600, marginBottom: 16 }}>{error}</div>}
        {invite && (
          <button type="submit" disabled={saving || loading} style={{ width: "100%", height: 44, border: "none", borderRadius: 8, background: saving ? "#93c5fd" : "linear-gradient(135deg,#2563eb,#3b82f6)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: saving ? "default" : "pointer", fontFamily: "Inter", boxShadow: "0 6px 16px rgba(37,99,235,.25)" }}>
            {saving ? "Создаём аккаунт..." : "Зарегистрироваться"}
          </button>
        )}
      </form>
    </div>
  );
}
