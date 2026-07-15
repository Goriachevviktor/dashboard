import { useState, useEffect, useCallback } from 'react';
import { useViewportFlags, initialsFromName, userColor } from '../utils.js';

function UserEditModal({ user, api, onError, onUserReset, onClose, onSave }) {
  const [displayName, setDisplayName] = useState(user.displayName || "");
  const [nextRole, setNextRole] = useState(user.role || "member");
  const [isActive, setIsActive] = useState(user.isActive !== false);
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [resettingPassword, setResettingPassword] = useState(false);
  const [error, setError] = useState("");
  const color = userColor(user);
  const initials = initialsFromName(displayName, user.email);
  const inputStyle = { width: "100%", height: 40, border: "1.5px solid #dbeafe", borderRadius: 8, padding: "0 12px", fontFamily: "Inter", fontSize: 14, outline: "none", background: "#fff" };
  const labelStyle = { display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 7 };

  useEffect(() => {
    function onKeyDown(e) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function resetPassword() {
    const confirmed = window.confirm(`Сбросить пароль для ${user.email}? Старые сессии пользователя будут завершены.`);
    if (!confirmed) return;
    setResettingPassword(true);
    setTemporaryPassword("");
    try {
      const result = await api.resetUserPassword(user.id);
      setTemporaryPassword(result.temporaryPassword || "");
      if (result.user) onUserReset(result.user);
    } catch (err) {
      onError(err);
    } finally {
      setResettingPassword(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (!displayName.trim()) {
      setError("Введите имя пользователя");
      return;
    }
    onSave(user.id, { displayName: displayName.trim(), role: nextRole, isActive });
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,30,70,.38)", zIndex: 330, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)", padding: 20 }}>
      <form onSubmit={handleSubmit} style={{ width: "min(92vw, 460px)", background: "#fff", borderRadius: 16, boxShadow: "0 24px 64px rgba(37,99,235,.22)", overflow: "hidden" }}>
        <div style={{ padding: "22px 24px 18px", borderBottom: "1px solid #e8f1fd", display: "flex", justifyContent: "space-between", gap: 14, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14, fontWeight: 800 }}>{initials}</div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#1e3a6e" }}>Карточка пользователя</div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{user.email}</div>
            </div>
          </div>
          <button type="button" onClick={onClose} style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: "#f0f6ff", color: "#64748b", cursor: "pointer" }}>×</button>
        </div>
        <div style={{ padding: 24, display: "grid", gap: 16 }}>
          <div>
            <label style={labelStyle}>Имя</label>
            <input value={displayName} onChange={e => { setDisplayName(e.target.value); setError(""); }} style={{ ...inputStyle, borderColor: error ? "#ef4444" : "#dbeafe" }} />
            {error && <div style={{ fontSize: 12, color: "#ef4444", marginTop: 5 }}>{error}</div>}
          </div>
          <div>
            <label style={labelStyle}>Роль</label>
            <select value={nextRole} onChange={e => setNextRole(e.target.value)} style={inputStyle}>
              <option value="member">Участник</option>
              <option value="viewer">Наблюдатель</option>
              <option value="admin">Администратор</option>
            </select>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, fontWeight: 600, color: "#475569" }}>
            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
            Активный пользователь
          </label>
          <div style={{ padding: 12, borderRadius: 10, border: "1px solid #fee2e2", background: "#fff7f7", display: "grid", gap: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 750, color: "#991b1b" }}>Сброс пароля</div>
                <div style={{ fontSize: 12, color: "#7f1d1d", marginTop: 2 }}>Создаёт временный пароль и завершает активные сессии пользователя.</div>
              </div>
              <button type="button" onClick={resetPassword} disabled={resettingPassword} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #fecaca", background: "#fff", color: "#dc2626", fontSize: 12, fontWeight: 750, cursor: resettingPassword ? "default" : "pointer", fontFamily: "Inter" }}>{resettingPassword ? "Сбрасываю..." : "Сбросить"}</button>
            </div>
            {temporaryPassword && (
              <div>
                <label style={{ ...labelStyle, color: "#991b1b" }}>Временный пароль</label>
                <input readOnly value={temporaryPassword} onFocus={e => e.target.select()} style={{ ...inputStyle, borderColor: "#fecaca", background: "#fff" }} />
              </div>
            )}
          </div>
        </div>
        <div style={{ padding: "16px 24px 24px", borderTop: "1px solid #f0f6ff", display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button type="button" onClick={onClose} style={{ padding: "10px 18px", borderRadius: 10, border: "1.5px solid #e2edf8", background: "#f8fafc", color: "#64748b", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "Inter" }}>Отмена</button>
          <button type="submit" style={{ padding: "10px 22px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#2563eb,#3b82f6)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "Inter", boxShadow: "0 4px 12px rgba(37,99,235,.25)" }}>Сохранить</button>
        </div>
      </form>
    </div>
  );
}


function UsersSection({ api, onError }) {
  const { isMobile } = useViewportFlags();
  const [users, setUsers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [inviteLink, setInviteLink] = useState("");
  const [loading, setLoading] = useState(true);
  const [editUser, setEditUser] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [userRows, inviteRows] = await Promise.all([api.listUsers(), api.listInvites()]);
      setUsers(userRows);
      setInvites(inviteRows);
    } catch (err) {
      onError(err);
    } finally {
      setLoading(false);
    }
  }, [api, onError]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);


  function formatUserActivityDate(value) {
    if (!value) return "не было";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "не было";
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayDiff = Math.round((startOfToday - startOfDate) / 86400000);
    if (dayDiff === 0) return "сегодня";
    if (dayDiff === 1) return "вчера";
    return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(date).replace(".", "");
  }

  const activeToday = users.filter(user => formatUserActivityDate(user.lastSeenAt) === "сегодня").length;
  const active7d = users.filter(user => (user.activity7dCount || 0) > 0).length;
  const totalActivity7d = users.reduce((sum, user) => sum + (user.activity7dCount || 0), 0);
  const inactiveUsers = users.filter(user => (user.activityCount || 0) === 0).length;

  async function createInvite(event) {
    event.preventDefault();
    try {
      const created = await api.createInvite({ email, role });
      const absolute = new URL(created.inviteUrl, window.location.origin).toString();
      setInviteLink(absolute);
      setEmail("");
      setRole("member");
      await load();
    } catch (err) {
      onError(err);
    }
  }

  async function saveUser(userId, patch) {
    try {
      const updated = await api.updateUser(userId, patch);
      setUsers(rows => rows.map(row => row.id === updated.id ? updated : row));
      setEditUser(null);
    } catch (err) {
      onError(err);
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "minmax(280px, 360px) 1fr", gap: 18, alignItems: "start" }}>
      {editUser && <UserEditModal key={editUser.id} user={editUser} api={api} onError={onError} onUserReset={resetUser => setUsers(rows => rows.map(row => row.id === resetUser.id ? { ...row, ...resetUser } : row))} onClose={() => setEditUser(null)} onSave={saveUser} />}
      <form onSubmit={createInvite} style={{ background: "#fff", border: "1px solid #e2edf8", borderRadius: 8, padding: 18, boxShadow: "0 2px 12px rgba(37,99,235,.06)" }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#1e3a6e", marginBottom: 14 }}>Новое приглашение</div>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 7 }}>Email коллеги</label>
        <input value={email} onChange={e => setEmail(e.target.value)} type="email" required style={{ width: "100%", height: 40, border: "1.5px solid #dbeafe", borderRadius: 8, padding: "0 12px", fontFamily: "Inter", fontSize: 14, outline: "none", marginBottom: 12 }} />
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 7 }}>Роль</label>
        <select value={role} onChange={e => setRole(e.target.value)} style={{ width: "100%", height: 40, border: "1.5px solid #dbeafe", borderRadius: 8, padding: "0 12px", fontFamily: "Inter", fontSize: 14, outline: "none", marginBottom: 14, background: "#fff" }}>
          <option value="member">Участник</option>
          <option value="viewer">Наблюдатель</option>
          <option value="admin">Администратор</option>
        </select>
        <button type="submit" style={{ width: "100%", height: 40, border: "none", borderRadius: 8, background: "linear-gradient(135deg,#2563eb,#3b82f6)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "Inter" }}>Создать ссылку</button>
        {inviteLink && <input readOnly value={inviteLink} onFocus={e => e.target.select()} style={{ width: "100%", height: 38, border: "1.5px solid #bfdbfe", borderRadius: 8, padding: "0 10px", fontFamily: "Inter", fontSize: 12, color: "#1e3a6e", marginTop: 14, background: "#eff6ff" }} />}
      </form>

      <div style={{ display: "grid", gap: 18 }}>
        <div style={{ background: "#fff", border: "1px solid #e2edf8", borderRadius: 8, padding: 18, boxShadow: "0 2px 12px rgba(37,99,235,.06)" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1e3a6e", marginBottom: 12 }}>Пользователи</div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2, minmax(0, 1fr))" : "repeat(4, minmax(0, 1fr))", gap: 8, marginBottom: 14 }}>
            <div style={{ padding: "10px 12px", borderRadius: 8, background: "#eff6ff", border: "1px solid #dbeafe" }}><div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Сегодня</div><div style={{ fontSize: 22, fontWeight: 850, color: "#2563eb", marginTop: 4 }}>{activeToday}</div></div>
            <div style={{ padding: "10px 12px", borderRadius: 8, background: "#f0fdf4", border: "1px solid #bbf7d0" }}><div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>За 7 дней</div><div style={{ fontSize: 22, fontWeight: 850, color: "#16a34a", marginTop: 4 }}>{active7d}</div></div>
            <div style={{ padding: "10px 12px", borderRadius: 8, background: "#fff7ed", border: "1px solid #fed7aa" }}><div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Действий</div><div style={{ fontSize: 22, fontWeight: 850, color: "#f59e0b", marginTop: 4 }}>{totalActivity7d}</div></div>
            <div style={{ padding: "10px 12px", borderRadius: 8, background: "#f8fafc", border: "1px solid #e2edf8" }}><div style={{ fontSize: 10, color: "#64748b", fontWeight: 700, textTransform: "uppercase" }}>Без активности</div><div style={{ fontSize: 22, fontWeight: 850, color: "#64748b", marginTop: 4 }}>{inactiveUsers}</div></div>
          </div>
          {loading ? <div style={{ color: "#64748b", fontSize: 13 }}>Загрузка...</div> : users.map(user => {
            const color = userColor(user);
            return (
            <div key={user.id} onClick={() => setEditUser(user)} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 12, padding: "10px 0", borderTop: "1px solid #eef5ff", alignItems: "center", cursor: "pointer" }}>
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 800 }}>{initialsFromName(user.displayName, user.email)}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: user.isActive === false ? "#94a3b8" : "#1e3a6e", textDecoration: user.isActive === false ? "line-through" : "none" }}>{user.displayName}</div>
                <div style={{ fontSize: 12, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>Входов: {user.loginCount || 0}</div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>Активность: {user.activityCount || 0} · 7 дней: {user.activity7dCount || 0}</div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>Последняя: {formatUserActivityDate(user.lastSeenAt)}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: user.role === "admin" ? "#2563eb" : "#64748b" }}>{user.role}</div>
                <button onClick={e => { e.stopPropagation(); setEditUser(user); }} title="Редактировать пользователя" style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid #dbeafe", background: "#fff", color: "#2563eb", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M8.5 3.5l2 2L5.2 10.8H3.2V8.8L8.5 3.5z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              </div>
            </div>
          );})}
        </div>
        <div style={{ background: "#fff", border: "1px solid #e2edf8", borderRadius: 8, padding: 18, boxShadow: "0 2px 12px rgba(37,99,235,.06)" }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1e3a6e", marginBottom: 12 }}>Последние приглашения</div>
          {invites.map(invite => (
            <div key={invite.id} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, padding: "10px 0", borderTop: "1px solid #eef5ff" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#1e3a6e" }}>{invite.email}</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>{invite.role}</div>
              </div>
              <div style={{ fontSize: 12, color: invite.usedAt ? "#10b981" : "#f59e0b", fontWeight: 700 }}>{invite.usedAt ? "использовано" : "активно"}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---- APP ----

export default UsersSection;
