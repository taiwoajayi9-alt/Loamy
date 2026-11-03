import type { Metadata } from "next";
import { SubmitButton } from "@/components/submit-button";
import { Card, Field, FormNotice, Tag } from "@/components/ui";
import { ROLE_INFO, ROLES } from "@/lib/team";
import { listTeam, recentTeamChanges, requireTeamAdmin } from "@/server/team-admin";
import { addTeamMemberAction, removeRoleAction } from "./actions";

export const metadata: Metadata = { title: "Team" };
export const dynamic = "force-dynamic";

const input = "min-h-[50px] w-full rounded-2xl border border-line-strong bg-card px-4 text-[15px]";
const dateFmt = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" });

export default async function AdminTeam({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const actor = await requireTeamAdmin("/admin/team");
  const { notice, error } = await searchParams;
  const [team, changes] = await Promise.all([listTeam(), recentTeamChanges()]);

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-title">Team</h1>
        <p className="text-ink-muted">Give people access to the parts of Loamy admin they need. They sign up for a free Loamy account first, then you add them here.</p>
      </div>
      {notice ? <FormNotice tone="success">{notice}</FormNotice> : null}
      {error ? <FormNotice tone="error">{error}</FormNotice> : null}

      <Card className="flex flex-col gap-4 p-5">
        <h2 className="text-lg font-semibold">Add someone</h2>
        <form action={addTeamMemberAction} className="grid gap-4 sm:grid-cols-2">
          <Field label="Their email" name="email" type="email" required placeholder="The email they signed up with" autoComplete="off" />
          <div className="flex flex-col gap-2">
            <label htmlFor="role" className="text-small font-semibold">Role</label>
            <select id="role" name="role" className={input} defaultValue="plant_expert">
              {ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_INFO[r].label}</option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <SubmitButton pendingLabel="Adding…">Add to team</SubmitButton>
          </div>
        </form>
        <details className="rounded-2xl bg-chip p-4">
          <summary className="cursor-pointer text-small font-semibold">What each role can do</summary>
          <dl className="mt-3 flex flex-col gap-2.5 text-small">
            {ROLES.map((r) => (
              <div key={r}>
                <dt className="font-semibold">{ROLE_INFO[r].label}</dt>
                <dd className="text-ink-muted">{ROLE_INFO[r].can}</dd>
              </div>
            ))}
          </dl>
        </details>
      </Card>

      <section className="flex flex-col gap-2" aria-labelledby="team-h">
        <h2 id="team-h" className="text-lg font-semibold">People with access ({team.length})</h2>
        <ul className="flex flex-col gap-2">
          {team.map((m) => (
            <li key={m.userId}>
              <Card className="flex flex-col gap-3 p-4">
                <div>
                  <p className="font-semibold">
                    {m.name ?? m.email}
                    {m.userId === actor.id ? <span className="font-normal text-ink-muted"> (you)</span> : null}
                  </p>
                  {m.name ? <p className="text-small text-ink-muted">{m.email}</p> : null}
                  <p className="text-xs text-ink-muted">Since {dateFmt.format(m.since)}</p>
                </div>
                <ul className="flex flex-wrap gap-2">
                  {m.roles.map((r) => (
                    <li key={r} className="flex items-center gap-1.5 rounded-full bg-chip py-1 pl-3 pr-1">
                      <span className="text-small font-semibold">{ROLE_INFO[r].label}</span>
                      <form action={removeRoleAction}>
                        <input type="hidden" name="userId" value={m.userId} />
                        <input type="hidden" name="role" value={r} />
                        <button
                          type="submit"
                          className="flex min-h-[32px] items-center rounded-full px-2.5 text-xs font-semibold text-danger-ink hover:bg-white"
                          aria-label={`Remove ${ROLE_INFO[r].label} from ${m.email}`}
                        >
                          Remove
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      {changes.length ? (
        <section className="flex flex-col gap-2" aria-labelledby="changes-h">
          <h2 id="changes-h" className="text-lg font-semibold">Recent changes</h2>
          <ul className="flex flex-col gap-1.5 text-small">
            {changes.map((c, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <Tag tone={c.granted ? "leaf" : "grey"}>{c.granted ? "Added" : "Removed"}</Tag>
                <span>
                  {c.role ? ROLE_INFO[c.role]?.label ?? c.role : "Role"} · {c.who}
                  <span className="text-ink-muted"> · by {c.by}, {dateFmt.format(c.at)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
