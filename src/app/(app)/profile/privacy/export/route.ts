import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/auth";
import { exportUserData } from "@/server/privacy";

export const dynamic = "force-dynamic";

/** "Download my data": a JSON file of everything Loamy holds about the signed-in person. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL("/login?next=/profile/privacy", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"));
  const data = await exportUserData(user.id);
  const day = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="loamy-my-data-${day}.json"`,
      "cache-control": "no-store",
    },
  });
}
