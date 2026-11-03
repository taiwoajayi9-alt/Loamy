"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button, Field, FormNotice } from "@/components/ui";
import {
  login,
  register,
  requestPasswordReset,
  updatePassword,
  type AuthFormState,
} from "./actions";

const initial: AuthFormState = {};

function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" full disabled={pending} aria-busy={pending}>
      {pending ? "One moment…" : children}
    </Button>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(login, initial);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <FormNotice tone="error">{state.error}</FormNotice> : null}
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Email" name="email" type="email" autoComplete="email" required error={state.fieldErrors?.email} />
      <Field label="Password" name="password" type="password" autoComplete="current-password" required error={state.fieldErrors?.password} />
      <Submit>Log in</Submit>
      <Link href="/forgot-password" className="self-start text-small font-semibold underline decoration-lemon decoration-2 underline-offset-4">
        Forgot your password?
      </Link>
    </form>
  );
}

export function RegisterForm({ next }: { next?: string }) {
  const [state, action] = useActionState(register, initial);
  if (state.message) return <FormNotice tone="success">{state.message}</FormNotice>;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <FormNotice tone="error">{state.error}</FormNotice> : null}
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="First name" name="firstName" autoComplete="given-name" placeholder="Ada" required error={state.fieldErrors?.firstName} />
      <Field label="Email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required error={state.fieldErrors?.email} />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="At least 8 characters."
        required
        error={state.fieldErrors?.password}
      />
      <div className="flex flex-col gap-1">
        <label className="flex items-start gap-2.5 text-small">
          <input type="checkbox" name="terms" className="mt-0.5 h-5 w-5 accent-[var(--loamy-black)]" aria-invalid={state.fieldErrors?.terms ? true : undefined} />
          <span>
            I agree to the terms and the privacy notice. Creating an account is free and doesn&apos;t start a subscription.
          </span>
        </label>
        {state.fieldErrors?.terms ? <p className="text-xs font-medium text-danger-ink">{state.fieldErrors.terms}</p> : null}
      </div>
      <Submit>Create free account</Submit>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action] = useActionState(requestPasswordReset, initial);
  if (state.message) return <FormNotice tone="success">{state.message}</FormNotice>;
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <FormNotice tone="error">{state.error}</FormNotice> : null}
      <Field label="Email" name="email" type="email" autoComplete="email" required error={state.fieldErrors?.email} />
      <Submit>Send reset link</Submit>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action] = useActionState(updatePassword, initial);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.error ? <FormNotice tone="error">{state.error}</FormNotice> : null}
      <Field label="New password" name="password" type="password" autoComplete="new-password" hint="At least 8 characters." required error={state.fieldErrors?.password} />
      <Submit>Save new password</Submit>
    </form>
  );
}
