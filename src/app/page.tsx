import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { getSessionUser, userHasEntitlement } from "@/server/auth";

export const dynamic = "force-dynamic";

/**
 * Front door. Visitors start at Discover and never need an account.
 * Returning members open the app straight into today's garden.
 */
export default async function Home() {
  const user = env.authConfigured() ? await getSessionUser().catch(() => null) : null;
  if (user && (await userHasEntitlement(user.id, "my_garden").catch(() => false))) redirect("/garden");
  redirect("/discover");
}
