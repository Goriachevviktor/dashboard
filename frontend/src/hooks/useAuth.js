import { useState, useEffect, useCallback } from "react";
import { dashboardRequest } from "../api.js";

export default function useAuth() {
  const [authLoading, setAuthLoading] = useState(true);
  const [accessToken, setAccessToken] = useState("");
  const [currentUser, setCurrentUser] = useState(null);

  // Restore session on mount
  useEffect(() => {
    let cancelled = false;
    async function restoreSession() {
      try {
        const result = await dashboardRequest("/auth/refresh", { method: "POST" });
        if (!cancelled) {
          setAccessToken(result.accessToken);
          setCurrentUser(result.user);
        }
      } catch {
        if (!cancelled) {
          setAccessToken("");
          setCurrentUser(null);
        }
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    }
    restoreSession();
    return () => { cancelled = true; };
  }, []);

  const handleLogin = useCallback((result) => {
    setAccessToken(result.accessToken);
    setCurrentUser(result.user);
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await dashboardRequest("/auth/logout", { method: "POST" });
    } catch {
      // Local auth state must still be cleared when the server session is gone.
    }
    setAccessToken("");
    setCurrentUser(null);
  }, []);

  // Build stable authRequest that refreshes token on 401
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

  return { authLoading, accessToken, currentUser, authRequest, handleLogin, handleLogout };
}
