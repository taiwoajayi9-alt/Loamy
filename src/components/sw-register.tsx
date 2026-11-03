"use client";

import { useEffect } from "react";

/** Registers the service worker in production only. Offline support is limited to the app shell. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Non-fatal: the app works without the service worker.
    });
  }, []);
  return null;
}
