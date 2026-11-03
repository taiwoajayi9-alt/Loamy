import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { safeNextPath } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const TYPES: EmailOtpType[] = ["signup", "email", "recovery", "email_change", "invite", "magiclink"];

/**
 * Email links (sign-up confirmation, password reset, email change) land here with a one-time token.
 * Unlike the code exchange in /auth/callback, this works when the email is opened in a different
 * browser or app from the one used to sign up, which is common on phones.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  // `redirect_to` is the full link the app asked for (…/auth/callback?next=/somewhere); keep only `next`.
  let next = safeNextPath(searchParams.get("next"), type === "recovery" ? "/reset-password" : "/");
  const redirectTo = searchParams.get("redirect_to");
  if (redirectTo) {
    try {
      const inner = new URL(redirectTo, origin).searchParams.get("next");
      if (inner) next = safeNextPath(inner, next);
    } catch {}
  }

  if (tokenHash && type && TYPES.includes(type) && env.authConfigured()) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/login?error=link`);
}
