import Link from "next/link";
import type { ReactNode } from "react";
import { Page } from "@/components/ui";
import { LEGAL } from "@/lib/legal";

/** Shared layout for the Terms and Privacy notice: readable line length, numbered sections, draft banner. */
export function LegalPage({ title, intro, children }: { title: string; intro: ReactNode; children: ReactNode }) {
  return (
    <Page className="gap-5">
      <div className="flex flex-col gap-2">
        <h1 className="text-title">{title}</h1>
        <p className="text-small text-ink-muted">Effective {LEGAL.effective}</p>
      </div>
      {!LEGAL.reviewed ? (
        <p role="note" className="rounded-2xl bg-lemon px-4 py-3 text-small font-medium text-ink">
          Draft for review. This page will be confirmed before Loamy opens to the public.
        </p>
      ) : null}
      <div className="text-[15px] leading-relaxed text-ink">{intro}</div>
      <div className="legal flex flex-col gap-6">{children}</div>
      <p className="border-t border-line pt-4 text-small text-ink-muted">
        See also: <Link href="/terms" className="underline">Terms of use</Link> · <Link href="/privacy" className="underline">Privacy notice</Link> ·{" "}
        <Link href="/profile/privacy" className="underline">Your privacy settings</Link>
      </p>
    </Page>
  );
}

export function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5" aria-labelledby={`s${n}`}>
      <h2 id={`s${n}`} className="text-lg font-semibold">
        {n}. {title}
      </h2>
      <div className="flex flex-col gap-2.5 text-[15px] leading-relaxed [&_li]:ml-5 [&_li]:list-disc [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5">{children}</div>
    </section>
  );
}
