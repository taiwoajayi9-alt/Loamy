import "server-only";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db/client";
import { analyticsEvents, anonymousSessions, identityLinks } from "@/db/schema";
import {
  ANALYTICS_POLICY_VERSION,
  ANON_ID_COOKIE,
  CONSENT_COOKIE,
  parseEvent,
  type EventName,
  type EventProps,
} from "@/lib/analytics/events";

/**
 * First-party analytics. Events live in our own `analytics_events` table; nothing goes to third parties.
 * Browser events are recorded only after the visitor allows analytics. Server-authoritative business events
 * (verified subscription, verified order) are recorded against the account, without the anonymous ID unless
 * the visitor allowed analytics.
 */

const ANON_ID_PATTERN = /^[0-9a-f-]{36}$/;

export async function readAnalyticsCookies() {
  const jar = await cookies();
  const consented = jar.get(CONSENT_COOKIE)?.value === "granted";
  const raw = jar.get(ANON_ID_COOKIE)?.value;
  const anonymousId = consented && raw && ANON_ID_PATTERN.test(raw) ? raw : null;
  return { consented, anonymousId };
}

async function touchAnonymousSession(anonymousId: string) {
  const [row] = await db
    .insert(anonymousSessions)
    .values({ anonymousId })
    .onConflictDoUpdate({ target: anonymousSessions.anonymousId, set: { lastSeenAt: new Date() } })
    .returning({ id: anonymousSessions.id });
  return row.id;
}

/** Records a validated event. Silently drops anything outside the taxonomy. Never throws. */
export async function recordEvent(input: {
  name: string;
  props?: unknown;
  anonymousId?: string | null;
  userId?: string | null;
}): Promise<boolean> {
  const event = parseEvent(input.name, input.props);
  if (!event) return false;
  try {
    if (input.anonymousId) await touchAnonymousSession(input.anonymousId);
    await db.insert(analyticsEvents).values({
      eventName: event.name,
      anonymousId: input.anonymousId ?? null,
      userId: input.userId ?? null,
      properties: event.props,
    });
    return true;
  } catch (err) {
    console.error("[analytics]", err);
    return false;
  }
}

/** For server code: record an event for the current visitor, respecting their analytics choice. */
export async function trackServer<N extends EventName>(name: N, props: EventProps<N>, userId?: string | null) {
  const { anonymousId } = await readAnalyticsCookies();
  return recordEvent({ name, props, anonymousId, userId });
}

/**
 * Identity linking (spec 16.2): when a visitor who allowed analytics creates an account, link their
 * anonymous session to the account under a recorded policy version. Never links without consent.
 */
export async function linkAnonymousSession(userId: string) {
  const { anonymousId } = await readAnalyticsCookies();
  if (!anonymousId) return;
  try {
    const session = await db.query.anonymousSessions.findFirst({ where: eq(anonymousSessions.anonymousId, anonymousId) });
    if (!session) return;
    await db
      .insert(identityLinks)
      .values({ anonymousSessionId: session.id, userId, policyVersion: ANALYTICS_POLICY_VERSION })
      .onConflictDoNothing();
  } catch (err) {
    console.error("[analytics:link]", err);
  }
}
