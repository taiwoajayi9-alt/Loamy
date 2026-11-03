"use client";

import { useEffect, useRef, useState } from "react";
import { ANON_ID_COOKIE, CONSENT_COOKIE, type EventName, type EventProps } from "@/lib/analytics/events";

const YEAR = 60 * 60 * 24 * 365;

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, value: string) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${YEAR}; Path=/; SameSite=Lax${secure}`;
}

function analyticsAllowed() {
  return typeof document !== "undefined" && readCookie(CONSENT_COOKIE) === "granted" && !!readCookie(ANON_ID_COOKIE);
}

/** Sends a taxonomy event. Does nothing unless the visitor allowed analytics. */
export function track<N extends EventName>(name: N, props: EventProps<N>) {
  if (!analyticsAllowed()) return;
  const body = JSON.stringify({ name, props });
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/events", new Blob([body], { type: "application/json" }));
    } else {
      void fetch("/api/events", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true });
    }
  } catch {
    // Analytics must never break the page.
  }
}

/** Fires one event when the component first renders (e.g. a page or profile view). */
export function TrackEvent<N extends EventName>({ name, props }: { name: N; props: EventProps<N> }) {
  const sent = useRef(false);
  const key = JSON.stringify(props);
  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    track(name, JSON.parse(key));
  }, [name, key]);
  return null;
}

/** Asks once whether Loamy may count anonymous usage. Nothing is recorded until the visitor allows it. */
export function AnalyticsConsent() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(readCookie(CONSENT_COOKIE) === null);
  }, []);

  if (!open) return null;

  const choose = (allow: boolean) => {
    writeCookie(CONSENT_COOKIE, allow ? "granted" : "denied");
    if (allow && !readCookie(ANON_ID_COOKIE)) writeCookie(ANON_ID_COOKIE, crypto.randomUUID());
    setOpen(false);
  };

  // A slim strip at the top of the page, in the normal flow: it never covers buttons or the nav.
  return (
    <div role="region" aria-label="Analytics choice" className="border-b border-line bg-card">
      <div className="mx-auto flex w-full max-w-[560px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
        <p className="min-w-0 flex-1 text-xs leading-snug text-ink-muted">
          <span className="font-semibold text-ink">Help us grow Loamy:</span> may we count anonymous visits? No ads, never sold.
        </p>
        <div className="flex flex-none gap-1.5">
          <button type="button" onClick={() => choose(true)} className="min-h-[36px] rounded-full bg-ink px-3.5 text-xs font-semibold text-white">
            Allow
          </button>
          <button type="button" onClick={() => choose(false)} className="min-h-[36px] rounded-full border border-line-strong px-3.5 text-xs font-semibold">
            No thanks
          </button>
        </div>
      </div>
    </div>
  );
}
