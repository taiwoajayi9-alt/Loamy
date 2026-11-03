/**
 * Loamy's email layout: table-based HTML with inline styles so it renders the same in Gmail,
 * Outlook and phone mail apps. Pure, so it's used by app emails, the Supabase auth templates and tests.
 */

const C = { canvas: "#F3F3F1", card: "#FFFFFF", ink: "#0A0A0A", muted: "#666666", line: "#ECECE8", lemon: "#C8E66B", leaf: "#5A9A2F" };
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,Helvetica,Arial,sans-serif";

export type EmailParts = {
  /** Shown in the inbox after the subject. */
  preheader: string;
  /** HTML: escape any customer-supplied text with `esc`. */
  heading: string;
  /** Paragraphs or small HTML blocks; escape any customer-supplied text with `esc`. */
  body: string[];
  button?: { label: string; url: string };
  /** Small print under the button. */
  footnote?: string;
};

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const wordmark = `<span style="font-size:26px;font-weight:800;letter-spacing:-0.04em;color:${C.ink}">lo<span style="color:${C.leaf}">a</span>my</span>`;

export function emailLayout(p: EmailParts): string {
  const para = (html: string) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:${C.ink}">${html}</p>`;
  const blocks = p.body.map((b) => (b.trimStart().startsWith("<") ? b : para(b))).join("");
  const button = p.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px"><tr><td style="border-radius:999px;background:${C.ink}">
        <a href="${p.button.url}" style="display:inline-block;padding:15px 28px;font-family:${FONT};font-size:16px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:999px">${esc(p.button.label)}</a>
      </td></tr></table>`
    : "";
  const foot = p.footnote ? `<p style="margin:0;font-size:13px;line-height:1.5;color:${C.muted}">${p.footnote}</p>` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${p.heading.replace(/<[^>]+>/g, "")}</title></head>
<body style="margin:0;padding:0;background:${C.canvas}">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(p.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.canvas}"><tr><td align="center" style="padding:32px 16px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;font-family:${FONT}">
    <tr><td style="padding:0 4px 20px">${wordmark}</td></tr>
    <tr><td style="background:${C.card};border:1px solid ${C.line};border-radius:24px;padding:32px 28px">
      <h1 style="margin:0 0 16px;font-size:26px;line-height:1.2;font-weight:800;letter-spacing:-0.02em;color:${C.ink}">${p.heading}</h1>
      ${blocks}${button}${foot}
    </td></tr>
    <tr><td style="padding:20px 4px 0;font-size:12px;line-height:1.5;color:${C.muted}">
      Loamy · Grow a little joy · Lagos, Nigeria<br>Loamy is a trading name of Kera Wellbeing Company Limited.
    </td></tr>
  </table>
</td></tr></table></body></html>`;
}

/** A simple two-column list (item · amount) for receipts. */
export function emailRows(rows: [string, string][], total?: [string, string]): string {
  const tr = (l: string, r: string, bold = false) =>
    `<tr><td style="padding:8px 0;border-bottom:1px solid ${C.line};font-size:15px;color:${C.ink};${bold ? "font-weight:700" : ""}">${l}</td><td align="right" style="padding:8px 0;border-bottom:1px solid ${C.line};font-size:15px;color:${C.ink};white-space:nowrap;${bold ? "font-weight:700" : ""}">${r}</td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px">${rows.map(([l, r]) => tr(l, r)).join("")}${total ? tr(total[0], total[1], true) : ""}</table>`;
}

/** Plain-text version from the same parts, for mail apps that don't show HTML. */
export function emailText(p: EmailParts): string {
  const strip = (h: string) => h.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|tr|li)>/gi, "\n").replace(/<td[^>]*>/gi, " ").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/[ \t]+/g, " ").trim();
  return [strip(p.heading), "", ...p.body.map(strip), p.button ? `${p.button.label}: ${p.button.url}` : "", p.footnote ? strip(p.footnote) : "", "", "Loamy · Grow a little joy · Lagos, Nigeria"]
    .filter((x, i, a) => !(x === "" && a[i - 1] === ""))
    .join("\n");
}
