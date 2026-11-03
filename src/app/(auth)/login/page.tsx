import Link from "next/link";
import type { Metadata } from "next";
import { FormNotice } from "@/components/ui";
import { LoginForm } from "../auth-forms";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-title">Welcome back</h1>
        <p className="text-ink-muted">Log in to pick up where you left off.</p>
      </div>
      {error === "link" ? <FormNotice tone="error">That link has expired or was already used. Try again.</FormNotice> : null}
      <LoginForm next={next} />
      <p className="text-small text-ink-muted">
        New to Loamy?{" "}
        <Link href={`/register${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-ink underline decoration-lemon decoration-2 underline-offset-4">
          Create a free account
        </Link>
      </p>
    </>
  );
}
