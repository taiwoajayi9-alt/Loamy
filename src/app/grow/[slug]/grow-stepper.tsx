"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { track } from "@/components/analytics";
import { Button, Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import { visibleQuestions, type Answers } from "@/lib/grow/questions";
import { createPlanAction } from "./actions";

export function GrowStepper({ slug, plantName }: { slug: string; plantName: string }) {
  const [answers, setAnswers] = useState<Answers>({});
  const [step, setStep] = useState(0);
  const [pending, start] = useTransition();
  const questions = visibleQuestions(answers);
  const q = questions[Math.min(step, questions.length - 1)];
  const isLast = step >= questions.length - 1;
  const chosen = answers[q.key];

  function choose(value: string) {
    // Changing an earlier answer can hide later questions, so drop answers that no longer apply.
    const next: Answers = { ...answers, [q.key]: value };
    const stillVisible = new Set(visibleQuestions(next).map((x) => x.key));
    for (const k of Object.keys(next) as (keyof Answers)[]) if (!stillVisible.has(k)) delete next[k];
    setAnswers(next);
    track("growing_plan_input_completed", { plant_id: slug, input_type: q.key });
  }

  function onNext() {
    if (!chosen) return;
    if (isLast) start(() => createPlanAction(slug, answers as Record<string, string>));
    else setStep(step + 1);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        {step > 0 ? (
          <button type="button" onClick={() => setStep(step - 1)} aria-label="Previous question" className="flex h-11 w-11 items-center justify-center rounded-full bg-card">
            <Icon name="back" />
          </button>
        ) : (
          <Link href={`/plants/${slug}`} aria-label={`Back to ${plantName}`} className="flex h-11 w-11 items-center justify-center rounded-full bg-card">
            <Icon name="back" />
          </Link>
        )}
        <div className="flex flex-1 gap-1.5" aria-hidden="true">
          {questions.map((x, i) => (
            <span key={x.key} className={cn("h-1.5 flex-1 rounded-full", i <= step ? "bg-ink" : "bg-line-strong")} />
          ))}
        </div>
        <span className="text-small tabular-nums text-ink-muted">
          {Math.min(step + 1, questions.length)} of {questions.length}
        </span>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-title">{q.prompt(plantName.toLowerCase())}</legend>
        {q.help ? <p className="-mt-1 mb-1 text-ink-muted">{q.help}</p> : null}
        {q.options.map((o) => {
          const selected = chosen === o.value;
          return (
            <label
              key={o.value}
              className={cn(
                "flex min-h-[60px] cursor-pointer items-center gap-3 rounded-2xl border bg-card px-4 py-3 transition-colors",
                selected ? "border-ink ring-2 ring-ink" : "border-line hover:border-line-strong",
              )}
            >
              <input type="radio" name={q.key} value={o.value} checked={selected} onChange={() => choose(o.value)} className="sr-only" />
              <span className={cn("flex h-6 w-6 flex-none items-center justify-center rounded-full border-2", selected ? "border-ink bg-ink text-lemon" : "border-line-strong")}>
                {selected ? <Icon name="check" size={14} /> : null}
              </span>
              <span className="flex flex-col">
                <span className="font-semibold">{o.label}</span>
                {o.hint ? <span className="text-small text-ink-muted">{o.hint}</span> : null}
              </span>
            </label>
          );
        })}
      </fieldset>

      <Button type="button" full onClick={onNext} disabled={!chosen || pending} aria-busy={pending}>
        {pending ? "Making your plan…" : isLast ? "See my plan" : "Next"}
      </Button>
    </div>
  );
}
