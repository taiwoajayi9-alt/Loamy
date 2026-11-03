"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui";

/** A submit button that shows a busy label while its form's server action runs. */
export function SubmitButton({
  children,
  pendingLabel = "One moment…",
  variant = "primary",
  size = "sm",
  full = false,
  name,
  value,
  id,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "lime" | "secondary" | "ghost";
  size?: "md" | "sm";
  full?: boolean;
  name?: string;
  value?: string;
  id?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} full={full} disabled={pending} aria-busy={pending} name={name} value={value} id={id}>
      {pending ? pendingLabel : children}
    </Button>
  );
}
