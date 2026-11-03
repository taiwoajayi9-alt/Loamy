"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { env } from "@/lib/env";
import { safeNextPath } from "@/lib/routes";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthFormState = { error?: string; fieldErrors?: Record<string, string>; message?: string };

const NOT_CONFIGURED: AuthFormState = {
  error: "Sign-in isn't set up in this environment yet. Add the Supabase keys to .env.local.",
};

const email = z.string().trim().toLowerCase().email("Enter a valid email address.");
const password = z.string().min(8, "Use at least 8 characters.");

function fieldErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of err.issues) out[String(issue.path[0])] ??= issue.message;
  return out;
}

export async function login(_: AuthFormState, form: FormData): Promise<AuthFormState> {
  if (!env.authConfigured()) return NOT_CONFIGURED;
  const parsed = z.object({ email, password: z.string().min(1, "Enter your password.") }).safeParse({
    email: form.get("email"),
    password: form.get("password"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  // Same message for unknown email and wrong password, so accounts can't be probed.
  if (error) return { error: "That email and password don't match. Try again or reset your password." };

  redirect(safeNextPath(form.get("next")?.toString()));
}

export async function register(_: AuthFormState, form: FormData): Promise<AuthFormState> {
  if (!env.authConfigured()) return NOT_CONFIGURED;
  const parsed = z
    .object({
      firstName: z.string().trim().min(1, "Tell us your first name.").max(60),
      email,
      password,
      terms: z.literal("on", { errorMap: () => ({ message: "Please accept the terms and privacy notice." }) }),
    })
    .safeParse({
      firstName: form.get("firstName"),
      email: form.get("email"),
      password: form.get("password"),
      terms: form.get("terms"),
    });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createSupabaseServerClient();
  const next = safeNextPath(form.get("next")?.toString());
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // A free account never starts a subscription.
      data: { first_name: parsed.data.firstName, accepted_terms_at: new Date().toISOString() },
      emailRedirectTo: `${env.public().NEXT_PUBLIC_SITE_URL}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) return { error: "We couldn't create your account. Check your details and try again." };

  return { message: "Check your email for a link to confirm your account." };
}

export async function requestPasswordReset(_: AuthFormState, form: FormData): Promise<AuthFormState> {
  if (!env.authConfigured()) return NOT_CONFIGURED;
  const parsed = z.object({ email }).safeParse({ email: form.get("email") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createSupabaseServerClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${env.public().NEXT_PUBLIC_SITE_URL}/auth/callback?next=/reset-password`,
  });
  // Always the same reply, whether or not the email has an account.
  return { message: "If that email has a Loamy account, we've sent a link to reset your password." };
}

export async function updatePassword(_: AuthFormState, form: FormData): Promise<AuthFormState> {
  if (!env.authConfigured()) return NOT_CONFIGURED;
  const parsed = z.object({ password }).safeParse({ password: form.get("password") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: "That reset link has expired. Request a new one." };
  redirect("/profile?password=updated");
}

export async function logout(): Promise<void> {
  if (env.authConfigured()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect("/");
}
