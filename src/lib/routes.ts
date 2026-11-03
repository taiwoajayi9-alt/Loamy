/**
 * Route access map (handoff section 6). Middleware uses this for optimistic redirects;
 * server code re-checks sign-in, entitlements and admin roles on every request.
 */

/** Open to everyone, including visitors. Discovery, plan preview and the shop never need an account. */
export const PUBLIC_PREFIXES = ["/", "/discover", "/plants", "/grow", "/shop", "/cart", "/login", "/register", "/forgot-password", "/reset-password", "/auth", "/offline"] as const;

/** Need a signed-in account. Checkout also needs a phone number and delivery address (owner decision). */
export const SIGNED_IN_PREFIXES = ["/profile", "/subscribe", "/orders", "/checkout"] as const;

/** Need a signed-in account AND an active subscription entitlement (checked server-side). */
export const SUBSCRIBER_PREFIXES = ["/garden", "/ask-loamy"] as const;

/** Need an admin role (checked server-side). */
export const ADMIN_PREFIXES = ["/admin"] as const;

function matches(pathname: string, prefixes: readonly string[]) {
  return prefixes.some((p) => (p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(`${p}/`)));
}

export function requiresSignIn(pathname: string): boolean {
  return (
    matches(pathname, SIGNED_IN_PREFIXES) || matches(pathname, SUBSCRIBER_PREFIXES) || matches(pathname, ADMIN_PREFIXES)
  );
}

export function requiresSubscription(pathname: string): boolean {
  return matches(pathname, SUBSCRIBER_PREFIXES);
}

export function isPublic(pathname: string): boolean {
  return !requiresSignIn(pathname);
}

/** Only allow same-site relative redirects after login (prevents open redirects). */
export function safeNextPath(next: string | null | undefined, fallback = "/discover"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
