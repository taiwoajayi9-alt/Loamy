import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon, type IconName } from "./icons";

export { Icon, type IconName } from "./icons";

// ── Wordmark ───────────────────────────────────────────────────
// Proposed logo v1: the hand replaces the "a". Use the approved asset when supplied.

export function Wordmark({ onBlack = false, className }: { onBlack?: boolean; className?: string }) {
  const hand = onBlack ? "var(--loamy-lemon)" : "var(--loamy-leaf)";
  return (
    <span className={cn("inline-block font-bold leading-none tracking-[-0.045em]", className)}>
      <span className="sr-only">loamy</span>
      <span aria-hidden="true">
        lo
        <svg viewBox="0 0 52 60" className="mx-[0.015em] inline-block h-[1em] w-[0.867em] align-[-0.067em]">
          <g fill="none" stroke={hand} strokeWidth="6.5" strokeLinecap="round">
            <circle cx="17" cy="40" r="11.5" />
            <path d="M32 25V53" />
            <path d="M39.5 24V37" />
            <path d="M46.5 27V38" />
          </g>
        </svg>
        my
      </span>
    </span>
  );
}

// ── Buttons ────────────────────────────────────────────────────

type ButtonVariant = "primary" | "lime" | "secondary" | "ghost";
type ButtonSize = "md" | "sm";

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40";
const buttonVariants: Record<ButtonVariant, string> = {
  primary: "bg-ink text-white hover:bg-[#222]",
  lime: "bg-lemon text-ink hover:bg-lemon-hover",
  secondary: "border border-line-strong bg-card text-ink hover:border-[#bdbdb8]",
  ghost: "bg-transparent text-ink hover:bg-chip",
};
const buttonSizes: Record<ButtonSize, string> = {
  md: "min-h-[52px] px-[22px] text-[15px]",
  sm: "min-h-[44px] px-4 text-sm",
};

export function buttonClass(variant: ButtonVariant = "primary", size: ButtonSize = "md", full = false) {
  return cn(buttonBase, buttonVariants[variant], buttonSizes[size], full && "w-full");
}

export function Button({
  variant = "primary",
  size = "md",
  full = false,
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize; full?: boolean }) {
  return <button className={cn(buttonClass(variant, size, full), className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  full = false,
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize; full?: boolean }) {
  return <Link className={cn(buttonClass(variant, size, full), className)} {...props} />;
}

// ── Tags ───────────────────────────────────────────────────────

type TagTone = "leaf" | "lemon" | "grey" | "peach" | "dark";
const tagTones: Record<TagTone, string> = {
  leaf: "bg-leaf-pale text-leaf-ink",
  lemon: "bg-lemon text-ink",
  grey: "bg-chip text-[#3a3a3a]",
  peach: "bg-[#fbe3cf] text-[#5c3410]",
  dark: "bg-ink text-white",
};

export function Tag({ tone = "leaf", children, className }: { tone?: TagTone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-[11px] py-[5px] text-xs font-semibold",
        tagTones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ── Icon tiles and quick actions ───────────────────────────────

export type TileColour = "lemon" | "sage" | "peach" | "sky" | "lilac" | "black" | "ghost";
const tileColours: Record<TileColour, string> = {
  lemon: "bg-lemon text-ink",
  sage: "bg-sage text-ink",
  peach: "bg-peach text-ink",
  sky: "bg-sky text-ink",
  lilac: "bg-lilac text-ink",
  black: "bg-ink text-lemon",
  ghost: "bg-chip text-ink",
};

export function IconTile({ icon, colour, size = 44 }: { icon: IconName; colour: TileColour; size?: number }) {
  return (
    <span
      className={cn("flex flex-none items-center justify-center rounded-full", tileColours[colour])}
      style={{ width: size, height: size }}
    >
      <Icon name={icon} size={Math.round(size * 0.45)} />
    </span>
  );
}

export function QuickAction({
  href,
  icon,
  colour,
  label,
  onBlack = false,
}: {
  href: string;
  icon: IconName;
  colour: TileColour;
  label: string;
  onBlack?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex flex-1 flex-col items-center gap-2 text-center text-xs font-semibold leading-tight",
        onBlack ? "text-white" : "text-ink",
      )}
    >
      <span className="transition-transform group-hover:-translate-y-px">
        <IconTile icon={icon} colour={colour} size={58} />
      </span>
      {label}
    </Link>
  );
}

// ── Cards ──────────────────────────────────────────────────────

export function HeroCard({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("loamy-hero flex flex-col gap-3.5 p-[22px]", className)}>{children}</section>;
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-card border border-line bg-card", className)}>{children}</div>;
}

type PlaceholderTone = "green" | "cream" | "grey";
const phTones: Record<PlaceholderTone, string> = { green: "bg-ph-green", cream: "bg-ph-cream", grey: "bg-ph-grey" };

/** Clearly labelled photo placeholder until real photography is supplied. */
export function PhotoPlaceholder({
  label,
  tone = "green",
  caption = "bottom",
  className,
}: {
  label: string;
  tone?: PlaceholderTone;
  caption?: "top" | "bottom" | "none";
  className?: string;
}) {
  return (
    <div className={cn("relative overflow-hidden", phTones[tone], className)}>
      {caption === "none" ? null : (
        <span
          className={cn(
            "absolute left-3 rounded-full bg-white/85 px-2.5 py-0.5 text-[11px] font-semibold text-[#2e4a1e]",
            caption === "top" ? "top-3" : "bottom-3",
          )}
        >
          Photo · {label}
        </span>
      )}
    </div>
  );
}

export function PhotoCard({
  href,
  title,
  line,
  badge,
  imageUrl,
  tone = "green",
}: {
  href: string;
  title: string;
  line?: string | null;
  badge?: string;
  imageUrl?: string | null;
  tone?: PlaceholderTone;
}) {
  return (
    <Link href={href} className="relative block h-[290px] w-[230px] flex-none overflow-hidden rounded-[28px] bg-ink text-white">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <span className="absolute inset-0">
          <PhotoPlaceholder label={title.toLowerCase()} tone={tone} caption="top" className="h-full w-full" />
        </span>
      )}
      <span className="absolute inset-x-0 bottom-0 flex flex-col gap-0.5 bg-gradient-to-b from-transparent to-[rgb(10_10_10/0.82)] p-[18px] pt-16">
        {badge ? <Tag tone="lemon" className="mb-1.5 self-start">{badge}</Tag> : null}
        <span className="text-[22px] font-bold tracking-[-0.02em]">{title}</span>
        {line ? <span className="text-small text-[#e5e5e0]">{line}</span> : null}
      </span>
    </Link>
  );
}

// ── Page scaffolding ───────────────────────────────────────────

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <main className={cn("mx-auto flex w-full max-w-[560px] flex-col gap-6 px-4 pb-nav-clearance pt-4", className)}>
      {children}
    </main>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-card border border-dashed border-line-strong bg-card p-6">
      <p className="font-semibold">{title}</p>
      <p className="text-small text-ink-muted">{body}</p>
      {action}
    </div>
  );
}

// ── Forms ──────────────────────────────────────────────────────

export function Field({
  label,
  name,
  error,
  hint,
  ...input
}: ComponentProps<"input"> & { label: string; name: string; error?: string; hint?: string }) {
  const id = `field-${name}`;
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-small font-semibold">
        {label}
      </label>
      <input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          "min-h-[50px] rounded-2xl border bg-card px-4 text-[15px] text-ink placeholder:text-[#8a8a86]",
          error ? "border-danger-ink" : "border-line-strong",
        )}
        {...input}
      />
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-ink-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-xs font-medium text-danger-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function FormNotice({ tone, children }: { tone: "error" | "success"; children: ReactNode }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-2xl px-4 py-3 text-small",
        tone === "error" ? "bg-danger-bg text-danger-ink" : "bg-leaf-pale text-leaf-ink",
      )}
    >
      {children}
    </p>
  );
}
