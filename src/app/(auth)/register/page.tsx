import Link from "next/link";
import type { Metadata } from "next";
import { RegisterForm } from "../auth-forms";

export const metadata: Metadata = { title: "Create a free account" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-title">Create your free account</h1>
        <p className="text-ink-muted">Save plants, keep your growing plans and pick up on any device.</p>
      </div>
      <RegisterForm next={next} />
      <p className="text-small text-ink-muted">
        Already have an account?{" "}
        <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-ink underline decoration-lemon decoration-2 underline-offset-4">
          Log in
        </Link>
      </p>
    </>
  );
}
