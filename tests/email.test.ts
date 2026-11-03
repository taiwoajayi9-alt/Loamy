import { describe, expect, it } from "vitest";
import { AUTH_TEMPLATES } from "@/lib/email/auth-templates";
import { emailLayout, emailText, esc } from "@/lib/email/layout";
import { orderConfirmedEmail } from "@/lib/email/messages";

const order = {
  site: "https://app.loamy.farm",
  orderNumber: "LMY-1",
  firstName: "<b>Ada</b>",
  phone: "+2348012345678",
  items: [{ name: "Pots & <script>", quantity: 2, lineTotalMinor: 650_000 }],
  subtotalMinor: 650_000,
  discountMinor: 0,
  totalMinor: 650_000,
};

describe("emails", () => {
  it("escapes customer text", () => {
    expect(esc(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
    const html = emailLayout(orderConfirmedEmail(order).parts);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>Ada</b>");
    expect(html).toContain("Thanks, &lt;b&gt;Ada&lt;/b&gt;!");
    expect(html).toContain("₦6,500");
    expect(html).toContain("https://app.loamy.farm/orders/LMY-1");
  });

  it("has a readable plain-text version", () => {
    const text = emailText(orderConfirmedEmail(order).parts);
    expect(text).toContain("View your order: https://app.loamy.farm/orders/LMY-1");
    expect(text).toContain("Thanks, <b>Ada</b>!");
    expect(text).not.toContain("&lt;");
  });

  it("auth emails use one-time token links that work in any browser", () => {
    for (const t of Object.values(AUTH_TEMPLATES)) {
      expect(t.content).toContain("{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}");
      expect(t.content).not.toContain("ConfirmationURL");
    }
    expect(AUTH_TEMPLATES.recovery.content).toContain("type=recovery");
  });
});
