"use client";

import { useEffect } from "react";

/**
 * Members' pages: register the service worker (offline campout pages, notifications).
 * Sign-in page: delete anything saved for offline, so the next person on a shared
 * device can't open the previous family's saved pages.
 */
export default function ServiceWorkerSetup({ mode }: { mode: "register" | "clear" }) {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (mode === "register") {
      if (process.env.NODE_ENV === "production") {
        navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
      }
      return;
    }
    if ("caches" in window) {
      caches.keys().then((keys) => keys.filter((k) => k.startsWith("pack361-")).forEach((k) => caches.delete(k))).catch(() => {});
    }
    navigator.serviceWorker.controller?.postMessage({ type: "clear" });
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith("pack361:offline:")) localStorage.removeItem(k);
    } catch {}
  }, [mode]);
  return null;
}
