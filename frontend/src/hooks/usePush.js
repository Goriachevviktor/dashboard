import { useState, useEffect } from "react";
import { urlBase64ToUint8Array } from "../utils.js";

export default function usePush(api, accessToken, onError) {
  const [pushStatus, setPushStatus] = useState("idle");

  useEffect(() => {
    if (!accessToken || !("Notification" in window)) return;
    if (Notification.permission === "granted") enablePush({ silent: true });
    else if (Notification.permission === "denied") setPushStatus("denied");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  async function enablePush({ silent = false } = {}) {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setPushStatus("unsupported");
      if (!silent) onError(new Error("Push-уведомления не поддерживаются"));
      return;
    }
    try {
      setPushStatus("loading");
      const keyInfo = await api.getPushPublicKey();
      if (!keyInfo.enabled || !keyInfo.publicKey) { setPushStatus("disabled"); return; }
      const permission = Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();
      if (permission !== "granted") {
        setPushStatus(permission === "denied" ? "denied" : "idle");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      const sub = existing || await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyInfo.publicKey),
      });
      await api.savePushSubscription(sub.toJSON());
      setPushStatus("enabled");
      if (!silent) await api.testPushNotification();
    } catch (error) {
      setPushStatus("error");
      if (!silent) onError(error);
    }
  }

  return { pushStatus, enablePush };
}
