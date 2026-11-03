import { taskAction } from "@/app/(app)/garden/actions";
import { SubmitButton } from "@/components/submit-button";
import { Card, Tag } from "@/components/ui";
import { dueLabel, lagosDay, daysBetween, taskTypeLabel } from "@/lib/care";

export type TaskView = { id: string; title: string; instructions: string; taskType: string; dueAt: Date; plantName?: string };

/** One care task with Done and Skip. Works without JavaScript (server actions). */
export function CareTaskCard({ task, back, showPlant = false }: { task: TaskView; back: string; showPlant?: boolean }) {
  const late = Math.max(0, daysBetween(lagosDay(task.dueAt), lagosDay(new Date())));
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {showPlant && task.plantName ? <Tag tone="leaf">{task.plantName}</Tag> : null}
        <Tag tone={late ? "peach" : "grey"}>{dueLabel(late)}</Tag>
        <span className="text-xs text-ink-muted">{taskTypeLabel(task.taskType)}</span>
      </div>
      <div>
        <p className="font-semibold">{task.title}</p>
        <p className="mt-1 text-small text-ink-muted">{task.instructions}</p>
      </div>
      <div className="flex gap-2">
        <form action={taskAction}>
          <input type="hidden" name="taskId" value={task.id} />
          <input type="hidden" name="outcome" value="done" />
          <input type="hidden" name="back" value={back} />
          <input type="hidden" name="plantName" value={task.plantName ?? "plant"} />
          <SubmitButton pendingLabel="Saving…">Done</SubmitButton>
        </form>
        <form action={taskAction}>
          <input type="hidden" name="taskId" value={task.id} />
          <input type="hidden" name="outcome" value="skip" />
          <input type="hidden" name="back" value={back} />
          <SubmitButton variant="secondary" pendingLabel="…">Skip</SubmitButton>
        </form>
      </div>
    </Card>
  );
}
