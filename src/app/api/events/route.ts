import { NextResponse, type NextRequest } from "next/server";
import { SERVER_ONLY_EVENTS, isEventName } from "@/lib/analytics/events";
import { readAnalyticsCookies, recordEvent } from "@/server/analytics";

/**
 * Browser event intake. Accepts only taxonomy events, only after the visitor allowed analytics,
 * and never the server-only business events. Always answers 204 so it can't be used to probe.
 */
export async function POST(request: NextRequest) {
  const noContent = new NextResponse(null, { status: 204 });

  if (request.headers.get("content-length") && Number(request.headers.get("content-length")) > 2048) return noContent;
  const { consented, anonymousId } = await readAnalyticsCookies();
  if (!consented || !anonymousId) return noContent;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noContent;
  }
  const { name, props } = (body ?? {}) as { name?: unknown; props?: unknown };
  if (!isEventName(name) || SERVER_ONLY_EVENTS.has(name)) return noContent;

  await recordEvent({ name, props, anonymousId });
  return noContent;
}
