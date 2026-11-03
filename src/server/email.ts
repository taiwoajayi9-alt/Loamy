import "server-only";
import { emailLayout, emailText } from "@/lib/email/layout";
import type { Email } from "@/lib/email/messages";
import { LEGAL } from "@/lib/legal";

export const emailConfigured = () => Boolean(process.env.RESEND_API_KEY);
export const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "https://app.loamy.farm").replace(/\/+$/, "");
/** Where new-order alerts go. */
export const teamInbox = () => process.env.ORDER_ALERT_EMAIL || LEGAL.email;

/**
 * Sends one email through Resend. Never throws: a failed email must not undo a payment or an order,
 * so problems are logged and the caller carries on.
 */
export async function sendEmail(to: string, email: Email, idempotencyKey?: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.info("[email] RESEND_API_KEY not set; skipped:", email.subject);
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || "Loamy <hello@loamy.farm>",
        to: [to],
        reply_to: LEGAL.email,
        subject: email.subject,
        html: emailLayout(email.parts),
        text: emailText(email.parts),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error("[email] Resend refused", res.status, (await res.text()).slice(0, 300));
    return res.ok;
  } catch (err) {
    console.error("[email] send failed", err);
    return false;
  }
}
