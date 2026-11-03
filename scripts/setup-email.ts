/**
 * One-time email setup. Run from the Loamy folder:  npm run email:setup
 *
 * 1. Points Supabase sign-in emails (confirm account, reset password) at Resend, so real customers
 *    get them, and uploads Loamy's branded versions of those emails.
 * 2. Saves the Resend key in .env.local so the app can send order and membership emails.
 *
 * Needs: a Resend API key (re_…) with loamy.farm verified in Resend, and a Supabase personal access
 * token (sbp_…) from https://supabase.com/dashboard/account/tokens. Keys are typed hidden and never printed.
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { AUTH_TEMPLATES } from "../src/lib/email/auth-templates";

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || "kimietimcjqdeomihnsw";
const FROM_ADDRESS = "hello@loamy.farm";

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
    let shown = false;
    out._writeToOutput = (s: string) => {
      if (!shown) {
        out.output.write(s);
        shown = true;
      }
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log("\nLoamy email setup\n");
  const resendKey = await askHidden("Paste your Resend API key (starts re_), then press Enter: ");
  if (!resendKey.startsWith("re_")) throw new Error("That doesn't look like a Resend key (it should start with re_).");
  const pat = await askHidden("Paste your Supabase access token (starts sbp_), then press Enter: ");
  if (!pat.startsWith("sbp_")) throw new Error("That doesn't look like a Supabase access token (it should start with sbp_).");

  console.log("\nChecking loamy.farm is verified in Resend…");
  const domains = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${resendKey}` } });
  if (domains.status === 401 || domains.status === 403) {
    console.log("  (This key can only send emails, so I can't check domains. That's fine; carrying on.)");
  } else if (domains.ok) {
    const list = ((await domains.json()) as { data?: { name: string; status: string }[] }).data ?? [];
    const d = list.find((x) => x.name === "loamy.farm");
    if (!d) throw new Error("loamy.farm isn't added in Resend yet. Add it under Domains, add the DNS records on Namecheap, then run this again.");
    if (d.status !== "verified") throw new Error(`loamy.farm is "${d.status}" in Resend. Wait until it says Verified (DNS can take up to an hour), then run this again.`);
    console.log("  ✅ loamy.farm is verified");
  }

  console.log("Updating Supabase sign-in emails…");
  const body = {
    external_email_enabled: true,
    smtp_admin_email: FROM_ADDRESS,
    smtp_sender_name: "Loamy",
    smtp_host: "smtp.resend.com",
    smtp_port: "465",
    smtp_user: "resend",
    smtp_pass: resendKey,
    rate_limit_email_sent: 100,
    mailer_subjects_confirmation: AUTH_TEMPLATES.confirmation.subject,
    mailer_templates_confirmation_content: AUTH_TEMPLATES.confirmation.content,
    mailer_subjects_recovery: AUTH_TEMPLATES.recovery.subject,
    mailer_templates_recovery_content: AUTH_TEMPLATES.recovery.content,
    mailer_subjects_email_change: AUTH_TEMPLATES.email_change.subject,
    mailer_templates_email_change_content: AUTH_TEMPLATES.email_change.content,
    mailer_subjects_magic_link: AUTH_TEMPLATES.magic_link.subject,
    mailer_templates_magic_link_content: AUTH_TEMPLATES.magic_link.content,
  };
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${pat}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = (await res.text()).slice(0, 300);
    if (res.status === 401) throw new Error("Supabase didn't accept the access token. Make a new one and try again.");
    throw new Error(`Supabase said no (${res.status}): ${msg}`);
  }
  console.log("  ✅ Sign-in emails now go through Resend, in Loamy's style");

  const envFile = ".env.local";
  const current = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
  if (/^RESEND_API_KEY=/m.test(current)) {
    console.log("  .env.local already has RESEND_API_KEY. Left it as it is.");
  } else {
    appendFileSync(envFile, `${current.endsWith("\n") || !current ? "" : "\n"}RESEND_API_KEY=${resendKey}\nEMAIL_FROM="Loamy <${FROM_ADDRESS}>"\n`);
    console.log("  ✅ Saved the Resend key in .env.local for order and membership emails");
  }
  console.log("\nDone. When the live app is set up, run: bash scripts/push-env.sh  (sends the new key to the server)\n");
}

main().catch((err) => {
  console.error(`\n❌ ${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
});
