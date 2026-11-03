"use client";

import { useEffect, useRef, useState } from "react";
import { ANON_ID_COOKIE, CONSENT_COOKIE, type EventName, type EventProps } from "@/lib/analytics/events";
import { Button } from "./ui";

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

  return (
    <div
      role="region"
      aria-label="Analytics choice"
      className="fixed inset-x-0 z-50 mx-auto max-w-[560px] px-3"
      style={{ bottom: "calc(96px + env(safe-area-inset-bottom, 0px))" }}
    >
      <div className="flex flex-col gap-3 rounded-[22px] border border-line bg-card p-4 shadow-nav">
        <p className="text-small">
          <span className="font-semibold">Help us grow Loamy.</span> May we count anonymous visits, like which plants
          people look at, to decide what to add next? No ads, and we never sell your data.
        </p>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => choose(true)}>
            Allow
          </Button>
          <Button size="sm" variant="secondary" onClick={() => choose(false)}>
            No thanks
          </Button>
        </div>
      </div>
    </div>
  );
}
