/** Writes every Loamy email to email-previews/ so you can open them in a browser:  npm run email:preview */
import { mkdirSync, writeFileSync } from "node:fs";
import { AUTH_TEMPLATES } from "../src/lib/email/auth-templates";
import { emailLayout } from "../src/lib/email/layout";
import { membershipRenewedEmail, membershipStartedEmail, newOrderAlertEmail, orderConfirmedEmail, refundEmail } from "../src/lib/email/messages";

const site = "https://app.loamy.farm";
const order = {
  site,
  orderNumber: "LMY-2611-0042",
  firstName: "Ada",
  phone: "+2348012345678",
  items: [
    { name: "Herb starter pack", quantity: 1, lineTotalMinor: 1_500_000 },
    { name: "Nursery pots, 1 gallon, pack of 10", quantity: 1, lineTotalMinor: 650_000 },
  ],
  subtotalMinor: 2_150_000,
  discountMinor: 215_000,
  totalMinor: 1_935_000,
};
const renewsOn = new Date("2027-02-03");
const all = {
  "order-confirmed": orderConfirmedEmail(order),
  "order-alert": newOrderAlertEmail({ ...order, recipient: "Ada Obi", address: "12 Allen Avenue", area: "Ikeja" }),
  "membership-started": membershipStartedEmail({ site, firstName: "Ada", planName: "Quarterly", amountMinor: 1_500_000, renewsOn }),
  "membership-renewed": membershipRenewedEmail({ site, firstName: "Ada", planName: "Quarterly", amountMinor: 1_500_000, renewsOn }),
  refund: refundEmail({ site, firstName: "Ada", orderNumber: order.orderNumber, amountMinor: 650_000, full: false }),
};
mkdirSync("email-previews", { recursive: true });
for (const [name, e] of Object.entries(all)) writeFileSync(`email-previews/${name}.html`, emailLayout(e.parts));
for (const [name, t] of Object.entries(AUTH_TEMPLATES)) writeFileSync(`email-previews/auth-${name}.html`, t.content);
console.log("Wrote", Object.keys(all).length + Object.keys(AUTH_TEMPLATES).length, "emails to email-previews/");
