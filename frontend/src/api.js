const DASHBOARD_CONFIG = {
  apiBaseUrl: "/api",
};

export async function dashboardRequest(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (options.authToken) {
    headers.Authorization = `Bearer ${options.authToken}`;
  }
  const response = await fetch(`${DASHBOARD_CONFIG.apiBaseUrl}${path}`, {
    ...options,
    headers,
    credentials: "include",
  });
  if (!response.ok) {
    let message = `API error ${response.status}`;
    try {
      const body = await response.json();
      message = body.detail || message;
    } catch (_) {}
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  if (response.status === 204) return null;
  return response.json();
}

export function buildApi(authRequest) {
  return {
    bootstrap: () => authRequest("/bootstrap"),
    createTask: (payload) => authRequest("/tasks", { method: "POST", body: JSON.stringify(payload) }),
    patchTask: (id, payload) => authRequest(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    deleteTask: (id) => authRequest(`/tasks/${id}`, { method: "DELETE" }),
    createEvent: (payload) => authRequest("/events", { method: "POST", body: JSON.stringify(payload) }),
    patchEvent: (id, payload) => authRequest(`/events/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    deleteEvent: (id) => authRequest(`/events/${id}`, { method: "DELETE" }),
    createEventTask: (eventId, payload) => authRequest(`/events/${eventId}/tasks`, { method: "POST", body: JSON.stringify(payload) }),
    patchEventTask: (eventId, taskId, payload) => authRequest(`/events/${eventId}/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(payload) }),
    deleteEventTask: (eventId, taskId) => authRequest(`/events/${eventId}/tasks/${taskId}`, { method: "DELETE" }),
    createSticker: (payload) => authRequest("/sync-stickers", { method: "POST", body: JSON.stringify(payload) }),
    patchSticker: (id, payload) => authRequest(`/sync-stickers/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    deleteSticker: (id) => authRequest(`/sync-stickers/${id}`, { method: "DELETE" }),
    createUcpTask: (payload) => authRequest("/ucp/tasks", { method: "POST", body: JSON.stringify(payload) }),
    patchUcpTask: (id, payload) => authRequest(`/ucp/tasks/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    deleteUcpTask: (id) => authRequest(`/ucp/tasks/${id}`, { method: "DELETE" }),
    createDevelopmentTask: (payload) => authRequest("/development-tasks", { method: "POST", body: JSON.stringify(payload) }),
    patchDevelopmentTask: (id, payload) => authRequest(`/development-tasks/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    deleteDevelopmentTask: (id) => authRequest(`/development-tasks/${id}`, { method: "DELETE" }),
    createAmbpTopic: (payload) => authRequest("/ambp-topics", { method: "POST", body: JSON.stringify(payload) }),
    patchAmbpTopic: (id, payload) => authRequest(`/ambp-topics/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    deleteAmbpTopic: (id) => authRequest(`/ambp-topics/${id}`, { method: "DELETE" }),
    listUsers: () => authRequest("/auth/users"),
    updateUser: (id, payload) => authRequest(`/auth/users/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
    resetUserPassword: (id) => authRequest(`/auth/users/${id}/reset-password`, { method: "POST" }),
    listInvites: () => authRequest("/auth/invites"),
    createInvite: (payload) => authRequest("/auth/invites", { method: "POST", body: JSON.stringify(payload) }),
    getPushPublicKey: () => authRequest("/push/vapid-public-key"),
    savePushSubscription: (payload) => authRequest("/push/subscriptions", { method: "POST", body: JSON.stringify(payload) }),
    testPushNotification: () => authRequest("/push/test", { method: "POST" }),
  };
}
