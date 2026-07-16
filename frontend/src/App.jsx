import { useState, useEffect, useCallback, useMemo } from 'react';
import { dashboardRequest, buildApi } from './api.js';
import { SECTIONS, MOBILE_SECTION_LABELS } from './constants.jsx';
import { useViewportFlags, isStandalonePwa, urlBase64ToUint8Array, normalizeDashboardData, initialsFromName, formatDashboardDate } from './utils.js';
import { COLORS, FONT_STACK, GLASS, AVATAR_GRADIENT } from './theme.js';
import AuthScreen from './screens/AuthScreen.jsx';
import RegisterScreen from './screens/RegisterScreen.jsx';
import TasksSection from './sections/TasksSection.jsx';
import TaskArchiveSection from './sections/TaskArchiveSection.jsx';
import EventsSection from './sections/EventsSection.jsx';
import SyncsSection from './sections/SyncsSection.jsx';
import UcpSection from './sections/UcpSection.jsx';
import AmbpSection from './sections/AmbpSection.jsx';
import PlanSection from './sections/PlanSection.jsx';
import UsersSection from './sections/UsersSection.jsx';
import RoadmapsSection from './sections/RoadmapsSection.jsx';
import { replaceTaskById } from './utils/dashboardTasks.js';
import MindMapSection from './sections/MindMapSection.jsx';
import BlockDiagramSection from './sections/BlockDiagramSection.jsx';
import DashboardSkeleton from './components/common/Skeleton.jsx';
import ErrorBoundary from './components/common/ErrorBoundary.jsx';
import { loadRoadmapLinkIndex } from './utils/taskRoadmapLinks.js';

const ACTIVE_SECTION_KEY = "dashboard_active_section_v1";

const SECTION_COMPONENTS = {
  tasks:   ({ data, api, onError, currentUser, roadmapLinks }) => <TasksSection initialTasks={data.tasks} team={data.team} api={api} onError={onError} currentUser={currentUser} roadmapLinksByTaskId={roadmapLinks} />,
  archive: ({ data, api, onError, currentUser, roadmapLinks }) => <TaskArchiveSection initialTasks={data.tasks} team={data.team} api={api} onError={onError} currentUser={currentUser} roadmapLinksByTaskId={roadmapLinks} />,
  events:  ({ data, api, onError, currentUser }) => <EventsSection initialEvents={data.events} initialEventTasks={data.eventTasks} team={data.team} api={api} onError={onError} currentUser={currentUser} />,
  roadmaps:({ data, api, currentUser, onError, onRoadmapLinksChange, onTaskUpdated }) => <RoadmapsSection tasks={data.tasks} team={data.team} api={api} currentUser={currentUser} onError={onError} onLinkIndexChange={onRoadmapLinksChange} onTaskUpdated={onTaskUpdated} />,
  mindmap: ({ api, onError }) => <MindMapSection api={api} onError={onError} />,
  diagrams:() => <BlockDiagramSection />,
  syncs:   ({ data, api, onError }) => <SyncsSection initialStickers={data.syncStickers} api={api} onError={onError} />,
  ucp:     ({ data, api, onError, currentUser }) => <UcpSection initialTasks={data.ucpTasks} team={data.team} api={api} onError={onError} currentUser={currentUser} />,
  ambp:    ({ data, api, onError }) => <AmbpSection initialTopics={data.ambpTopics} api={api} onError={onError} />,
  plan:    ({ data, api, onError, currentUser }) => <PlanSection initialTasks={data.developmentTasks} team={data.team} api={api} onError={onError} currentUser={currentUser} />,
  users:   ({ api, onError }) => <UsersSection api={api} onError={onError} />,
};

export default function App() {
  const { isCompact, isMobile } = useViewportFlags();

  // ── 10a: Auth state ──
  const [requestedActive, setActive] = useState(() => {
    try {
      return window.localStorage.getItem(ACTIVE_SECTION_KEY) || "tasks";
    } catch {
      return "tasks";
    }
  });
  const [collapsed, setCollapsed] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [accessToken, setAccessToken] = useState("");
  const [currentUser, setCurrentUser] = useState(null);
  const [dashboardData, setDashboardData] = useState(null);
  const [dashboardDataRevision, setDashboardDataRevision] = useState(0);
  const [roadmapLinksByTaskId, setRoadmapLinksByTaskId] = useState({});
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState("");
  const [isOnline, setIsOnline] = useState(window.navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [standalone, setStandalone] = useState(isStandalonePwa());
  const [pushStatus, setPushStatus] = useState(() => (
    "Notification" in window && Notification.permission === "denied" ? "denied" : "idle"
  ));

  const visibleSections = SECTIONS.filter(s => (!s.adminOnly || currentUser?.role === "admin") && !(standalone && s.id === "archive"));
  const section = visibleSections.find(s => s.id === requestedActive) || visibleSections[0];
  const active = section?.id || "tasks";
  const sidebarCollapsed = isCompact ? true : collapsed;
  const topbarDate = formatDashboardDate(new Date());
  const userInitials = initialsFromName(currentUser?.displayName, currentUser?.email);
  const inviteToken = new URLSearchParams(window.location.search).get("invite");

  const onError = useCallback((error) => {
    setApiError(error?.message || "Ошибка API");
    window.setTimeout(() => setApiError(""), 5000);
  }, []);

  const onTaskUpdated = useCallback((savedTask) => {
    setDashboardData(current => current ? {
      ...current,
      tasks: replaceTaskById(current.tasks, savedTask),
    } : current);
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handleBeforeInstall = (e) => { e.preventDefault(); setInstallPrompt(e); };
    const handleInstalled = () => { setInstallPrompt(null); setStandalone(true); };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle("dashboard-mobile", isMobile);
    return () => document.body.classList.remove("dashboard-mobile");
  }, [isMobile]);

  useEffect(() => {
    if (!section?.id) return;
    if (requestedActive !== section.id) {
      const timer = window.setTimeout(() => setActive(section.id), 0);
      return () => window.clearTimeout(timer);
    }
    try {
      window.localStorage.setItem(ACTIVE_SECTION_KEY, section.id);
    } catch {
      // Ignore localStorage restrictions.
    }
  }, [requestedActive, section?.id]);

  // Restore session on mount
  useEffect(() => {
    let cancelled = false;
    async function restoreSession() {
      try {
        const result = await dashboardRequest("/auth/refresh", { method: "POST" });
        if (!cancelled) { setAccessToken(result.accessToken); setCurrentUser(result.user); }
      } catch {
        if (!cancelled) { setAccessToken(""); setCurrentUser(null); }
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    }
    restoreSession();
    return () => { cancelled = true; };
  }, []);

  // ── 10b: API client ──
  const authRequest = useCallback(async (path, options = {}) => {
    try {
      return await dashboardRequest(path, { ...options, authToken: accessToken });
    } catch (error) {
      if (error.status !== 401) throw error;
      const refreshed = await dashboardRequest("/auth/refresh", { method: "POST" });
      setAccessToken(refreshed.accessToken);
      setCurrentUser(refreshed.user);
      return dashboardRequest(path, { ...options, authToken: refreshed.accessToken });
    }
  }, [accessToken]);

  const api = useMemo(() => buildApi(authRequest), [authRequest]);

  useEffect(() => {
    let cancelled = false;
    if (!accessToken || !currentUser) {
      return () => { cancelled = true; };
    }
    async function loadRoadmapLinks() {
      try {
        const index = await loadRoadmapLinkIndex(api);
        if (!cancelled) setRoadmapLinksByTaskId(index);
      } catch (error) {
        if (!cancelled) {
          setRoadmapLinksByTaskId({});
          onError(error);
        }
      }
    }
    void loadRoadmapLinks();
    return () => { cancelled = true; };
  }, [accessToken, api, currentUser, onError]);

  // Load dashboard data
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!accessToken) { setLoading(false); return; }
      setLoading(true);
      try {
        const data = await api.bootstrap();
        if (!cancelled) {
          setDashboardData(normalizeDashboardData(data, currentUser));
          setDashboardDataRevision(revision => revision + 1);
        }
      } catch (error) {
        if (!cancelled) {
          setDashboardData(normalizeDashboardData({}, currentUser));
          setDashboardDataRevision(revision => revision + 1);
          onError(error);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [accessToken, api, currentUser, onError]);

  const enablePush = useCallback(async ({ silent = false } = {}) => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setPushStatus("unsupported");
      if (!silent) onError(new Error("Push-уведомления не поддерживаются"));
      return;
    }
    try {
      setPushStatus("loading");
      const keyInfo = await api.getPushPublicKey();
      if (!keyInfo.enabled || !keyInfo.publicKey) { setPushStatus("disabled"); return; }
      const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (permission !== "granted") { setPushStatus(permission === "denied" ? "denied" : "idle"); return; }
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      const sub = existing || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(keyInfo.publicKey) });
      await api.savePushSubscription(sub.toJSON());
      setPushStatus("enabled");
      if (!silent) await api.testPushNotification();
    } catch (error) {
      setPushStatus("error");
      if (!silent) onError(error);
    }
  }, [api, onError]);

  // Push notifications
  useEffect(() => {
    if (!accessToken || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    const timer = window.setTimeout(() => { void enablePush({ silent: true }); }, 0);
    return () => window.clearTimeout(timer);
  }, [accessToken, enablePush]);

  function handleLogin(result) {
    setLoading(true);
    setAccessToken(result.accessToken);
    setCurrentUser(result.user);
    setDashboardData(null);
    setRoadmapLinksByTaskId({});
    setApiError("");
  }

  async function handleLogout() {
    try { await dashboardRequest("/auth/logout", { method: "POST" }); } catch { /* сессия могла уже истечь */ }
    setAccessToken(""); setCurrentUser(null); setDashboardData(null); setRoadmapLinksByTaskId({});
  }

  async function handleInstallClick() {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => null);
    setInstallPrompt(null);
    setStandalone(isStandalonePwa());
  }

  // ── Auth screens ──
  if (authLoading) {
    return <div style={{ height: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", background: isMobile ? "#f0f6ff" : "#fbfdff", color: isMobile ? "#64748b" : COLORS.textMuted, fontSize: 14 }}>Проверяем сессию...</div>;
  }
  if (inviteToken && (!currentUser || !accessToken)) {
    return <RegisterScreen inviteToken={inviteToken} onLogin={handleLogin} />;
  }
  if (!currentUser || !accessToken) {
    return <AuthScreen onLogin={handleLogin} />;
  }

  const mobileNavSections = visibleSections.filter(s => s.id !== "users");

  // ── 10c: Sidebar + Topbar ──
  return (
    <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", height: "100dvh", width: "100%", overflow: "hidden", background: isMobile ? "#f0f6ff" : COLORS.bgGradient, paddingTop: isMobile ? "var(--safe-top)" : 0 }}>

      {/* SIDEBAR */}
      {!isMobile && (
        <div style={{ width: sidebarCollapsed ? 64 : "20%", minWidth: sidebarCollapsed ? 64 : 220, maxWidth: sidebarCollapsed ? 64 : 300, ...GLASS.sidebar, borderRight: "1px solid " + COLORS.hairline, display: "flex", flexDirection: "column", transition: "width .3s ease, min-width .3s ease", overflow: "hidden", flexShrink: 0 }}>
          <div style={{ padding: sidebarCollapsed ? "20px 0" : "24px 20px 20px", borderBottom: "1px solid " + COLORS.hairline, flexShrink: 0, display: "flex", alignItems: "center", gap: 12, justifyContent: sidebarCollapsed ? "center" : "flex-start" }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, background: AVATAR_GRADIENT, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="2" y="9" width="4" height="7" rx="1" fill="white"/><rect x="7" y="5" width="4" height="11" rx="1" fill="white" opacity=".8"/><rect x="12" y="2" width="4" height="14" rx="1" fill="white" opacity=".6"/></svg>
            </div>
            {!sidebarCollapsed && <div><div style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink, letterSpacing: -.2 }}>Дашборд</div><div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 1 }}>Руководитель</div></div>}
          </div>

          {!sidebarCollapsed && <div style={{ padding: "16px 20px 8px", fontSize: 10, fontWeight: 600, color: COLORS.textFaint, letterSpacing: 1.2, textTransform: "uppercase" }}>Навигация</div>}

          <nav style={{ flex: 1, overflow: "auto", padding: sidebarCollapsed ? "8px 0" : "8px 10px", display: "flex", flexDirection: "column", gap: 2 }}>
            {visibleSections.map(s => {
              const isActive = s.id === active;
              return (
                <button key={s.id} onClick={() => setActive(s.id)} title={sidebarCollapsed ? s.label : undefined}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: sidebarCollapsed ? "12px 0" : "11px 14px", justifyContent: sidebarCollapsed ? "center" : "flex-start", borderRadius: sidebarCollapsed ? 0 : 10, border: "none", background: isActive ? COLORS.accentSoft : "transparent", color: isActive ? COLORS.accent : COLORS.textMid, cursor: "pointer", fontFamily: FONT_STACK, transition: "background .15s, color .15s", position: "relative", outline: "none", width: "100%" }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = "rgba(118,118,128,.08)"; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}>
                  <span style={{ color: isActive ? COLORS.accent : COLORS.textFaint, flexShrink: 0 }}>{s.icon}</span>
                  {!sidebarCollapsed && <span style={{ fontSize: 13, fontWeight: isActive ? 600 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.label}</span>}
                </button>
              );
            })}
          </nav>

          <div style={{ borderTop: "1px solid " + COLORS.hairline, padding: sidebarCollapsed ? "16px 0" : "16px 10px", display: "flex", flexDirection: "column", gap: 12, flexShrink: 0 }}>
            {!isCompact && (
              <button onClick={() => setCollapsed(!collapsed)}
                style={{ display: "flex", alignItems: "center", justifyContent: sidebarCollapsed ? "center" : "flex-start", gap: 8, background: "transparent", border: "none", color: COLORS.textFaint, cursor: "pointer", padding: "4px 8px", borderRadius: 8, fontFamily: FONT_STACK, fontSize: 12, outline: "none" }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ transform: sidebarCollapsed ? "rotate(180deg)" : "none", transition: "transform .3s" }}><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                {!sidebarCollapsed && <span>Свернуть</span>}
              </button>
            )}
            {!sidebarCollapsed && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 10, background: "rgba(118,118,128,.08)", borderRadius: 12 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: AVATAR_GRADIENT, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{userInitials}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentUser.displayName}</div>
                  <div style={{ fontSize: 11, color: COLORS.textMuted }}>{currentUser.role === "admin" ? "Администратор" : "Участник"}</div>
                </div>
                <button onClick={handleLogout} title="Выйти" style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "rgba(118,118,128,.1)", color: COLORS.textMuted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="15" height="15" viewBox="0 0 20 20" fill="none"><path d="M8 5V4a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M12 10H3m0 0 3-3m-3 3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MAIN */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>

        {/* TOPBAR */}
        <div style={{ minHeight: isMobile ? 58 : 72, ...(isMobile ? { background: "#fff", borderBottom: "1px solid #e2edf8" } : { ...GLASS.topbar, borderBottom: "1px solid " + COLORS.hairline }), display: "flex", alignItems: "center", padding: isMobile ? "10px 14px" : "0 32px", gap: isMobile ? 10 : 16, flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: isMobile ? 17 : 26, fontWeight: isMobile ? 750 : 800, color: isMobile ? "#1e3a6e" : COLORS.ink, letterSpacing: isMobile ? -.3 : -.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{section.label}</div>
            {!isMobile && <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 1 }}>{section.description}</div>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 20, flexShrink: 0 }}>
            <div title={isOnline ? "Сеть доступна" : "Нет сети"} style={isMobile
              ? { display: "flex", alignItems: "center", gap: 7, padding: 8, borderRadius: 999, border: "1px solid " + (isOnline ? "#bbf7d0" : "#fecaca"), background: isOnline ? "#f0fdf4" : "#fef2f2", color: isOnline ? "#15803d" : "#b91c1c", fontSize: 12, fontWeight: 700, flexShrink: 0 }
              : { display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 600, color: isOnline ? COLORS.greenText : COLORS.redText, flexShrink: 0 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: isMobile ? "currentColor" : (isOnline ? COLORS.green : COLORS.red) }}></span>
              {!isMobile && (isOnline ? "Online" : "Offline")}
            </div>
            {installPrompt && !standalone && (
              <button onClick={handleInstallClick} style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 12px", borderRadius: 999, border: "1px solid #bfdbfe", background: "#eff6ff", color: "#2563eb", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "Inter", flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 2v8m0 0 3-3m-3 3L5 7M3 12.5h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                {!isMobile && "Установить"}
              </button>
            )}
            {!isMobile && <div style={{ fontSize: 13, color: COLORS.textMuted }}>{topbarDate}</div>}
            {!isMobile && <div style={{ width: 1, height: 24, background: COLORS.hairlineStrong }}></div>}
            <button onClick={() => enablePush()} title="Push-уведомления"
              style={isMobile
                ? { width: 40, minWidth: 40, height: 40, padding: 0, gap: 7, borderRadius: 999, border: "1px solid " + (pushStatus === "enabled" ? "#bbf7d0" : pushStatus === "error" || pushStatus === "denied" ? "#fecaca" : "#dbeafe"), background: pushStatus === "enabled" ? "#f0fdf4" : pushStatus === "error" || pushStatus === "denied" ? "#fef2f2" : "#fff", color: pushStatus === "enabled" ? "#10b981" : pushStatus === "error" || pushStatus === "denied" ? "#ef4444" : "#64748b", cursor: pushStatus === "loading" ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: "Inter", fontSize: 12, fontWeight: 700 }
                : { minWidth: 36, height: 34, padding: "0 14px", gap: 7, borderRadius: 999, border: "none", background: "rgba(118,118,128,.08)", color: pushStatus === "enabled" ? COLORS.greenText : pushStatus === "error" || pushStatus === "denied" ? COLORS.redText : COLORS.textMid, cursor: pushStatus === "loading" ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: FONT_STACK, fontSize: 12, fontWeight: 600 }}
              disabled={pushStatus === "loading"}>
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M10 2a6 6 0 0 0-6 6v3l-1.5 2.5h15L16 11V8a6 6 0 0 0-6-6z" stroke="currentColor" strokeWidth="1.5" fill="none"/><path d="M8.5 16a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.5" fill="none"/></svg>
              {!isMobile && (pushStatus === "enabled" ? "Вкл" : pushStatus === "loading" ? "..." : "Push")}
            </button>
            <button onClick={handleLogout} title="Выйти" style={{ width: isMobile ? 40 : 36, height: isMobile ? 40 : 36, borderRadius: "50%", border: "none", background: isMobile ? "linear-gradient(135deg,#2563eb,#60a5fa)" : AVATAR_GRADIENT, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: isMobile ? "Inter" : FONT_STACK, flexShrink: 0 }}>{userInitials}</button>
          </div>
        </div>

        {/* ── 10d: Section content ── */}
        <div style={{ flex: 1, overflow: "auto", padding: isMobile ? "14px 14px calc(var(--mobile-tabbar-height) + var(--safe-bottom) + 18px)" : 28, WebkitOverflowScrolling: "touch" }}>
          {apiError && (
            <div style={{ position: "sticky", top: 0, zIndex: 50, marginBottom: 12, padding: "10px 14px", borderRadius: 10, background: "#fef2f2", border: "1px solid #fecaca", color: "#b91c1c", fontSize: 13, fontWeight: 600 }}>{apiError}</div>
          )}
          {!isOnline && (
            <div style={{ position: "sticky", top: apiError ? 48 : 0, zIndex: 49, marginBottom: 12, padding: "10px 14px", borderRadius: 10, background: "#fff7ed", border: "1px solid #fed7aa", color: "#9a3412", fontSize: 13, fontWeight: 600 }}>
              Нет подключения к сети. Изменения сохранятся после восстановления соединения.
            </div>
          )}
          {loading || !dashboardData ? (
            <DashboardSkeleton />
          ) : (
            <ErrorBoundary key={`${section.id}:${dashboardDataRevision}`}>
              {SECTION_COMPONENTS[section.id]?.({ data: dashboardData, api, onError, currentUser, roadmapLinks: roadmapLinksByTaskId, onRoadmapLinksChange: setRoadmapLinksByTaskId, onTaskUpdated })}
            </ErrorBoundary>
          )}
        </div>

        {/* MOBILE NAV */}
        {isMobile && (
          <nav style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 120, padding: "5px 10px calc(5px + var(--safe-bottom))", background: "rgba(255,255,255,.96)", borderTop: "1px solid #dbeafe", boxShadow: "0 -8px 22px rgba(30,58,110,.09)", backdropFilter: "blur(14px)" }}>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${mobileNavSections.length}, minmax(0,1fr))`, gap: 3, maxWidth: 560, margin: "0 auto", padding: "0 2px" }}>
              {mobileNavSections.map(s => {
                const isActive = s.id === active;
                return (
                  <button key={s.id} onClick={() => setActive(s.id)}
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 24, width: "100%", minWidth: 0, minHeight: 36, padding: "3px 1px", borderRadius: 14, border: "none", background: isActive ? "#eff6ff" : "transparent", color: isActive ? "#2563eb" : "#64748b", cursor: "pointer", fontFamily: "Inter", fontSize: 8, lineHeight: 1.1, fontWeight: 700, whiteSpace: "nowrap", flexShrink: 0, touchAction: "manipulation" }}>
                    <span style={{ display: "flex", color: isActive ? "#2563eb" : "#94a3b8", transform: "scale(1.18)", transformOrigin: "center" }}>{s.icon}</span>
                    <span style={{ maxWidth: "100%", fontSize: 8, lineHeight: 1 }}>{MOBILE_SECTION_LABELS[s.id] || s.label}</span>
                  </button>
                );
              })}
            </div>
          </nav>
        )}
      </div>
    </div>
  );
}
