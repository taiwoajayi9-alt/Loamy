import type { Metadata } from "next";
import { ResetPasswordForm } from "../auth-forms";

export const metadata: Metadata = { title: "Choose a new password" };

export default function ResetPasswordPage() {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-title">Choose a new password</h1>
        <p className="text-ink-muted">Use at least 8 characters.</p>
      </div>
      <ResetPasswordForm />
    </>
  );
}
