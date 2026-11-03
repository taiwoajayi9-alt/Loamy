import { formatNaira } from "@/lib/money";
import { formatPhone } from "@/lib/shop";
import { emailRows, esc, type EmailParts } from "./layout";

/** What each email says. Pure functions: data in, subject + parts out. */

export type Email = { subject: string; parts: EmailParts };

const dateFmt = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" });

type OrderEmailInput = {
  site: string;
  orderNumber: string;
  firstName: string | null;
  phone: string;
  items: { name: string; quantity: number; lineTotalMinor: number }[];
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
};

export function orderConfirmedEmail(o: OrderEmailInput): Email {
  const rows: [string, string][] = o.items.map((i) => [`${esc(i.name)} × ${i.quantity}`, formatNaira(i.lineTotalMinor)]);
  if (o.discountMinor > 0) rows.push(["Discount", `− ${formatNaira(o.discountMinor)}`]);
  return {
    subject: `Order ${o.orderNumber} is confirmed`,
    parts: {
      preheader: `We’ll call ${formatPhone(o.phone)} to arrange delivery.`,
      heading: `Thanks${o.firstName ? `, ${esc(o.firstName)}` : ""}! Your order is in.`,
      body: [
        `We’ve received your payment for order <strong>${esc(o.orderNumber)}</strong>.`,
        emailRows(rows, ["Paid", formatNaira(o.totalMinor)]),
        `<strong>What happens next:</strong> we’ll call you on ${esc(formatPhone(o.phone))} to agree your delivery time and fee. Keep your phone close.`,
      ],
      button: { label: "View your order", url: `${o.site}/orders/${encodeURIComponent(o.orderNumber)}` },
      footnote: "Something not right? Just reply to this email.",
    },
  };
}

export function newOrderAlertEmail(o: OrderEmailInput & { recipient: string; address: string; area: string }): Email {
  return {
    subject: `New order ${o.orderNumber} · ${formatNaira(o.totalMinor)}`,
    parts: {
      preheader: `Call ${formatPhone(o.phone)} to arrange delivery.`,
      heading: "New paid order",
      body: [
        emailRows(o.items.map((i) => [`${esc(i.name)} × ${i.quantity}`, formatNaira(i.lineTotalMinor)]), ["Paid", formatNaira(o.totalMinor)]),
        `<strong>${esc(o.recipient)}</strong> · ${esc(formatPhone(o.phone))}<br>${esc(o.address)}, ${esc(o.area)}, Lagos`,
      ],
      button: { label: "Open in admin", url: `${o.site}/admin/orders/${encodeURIComponent(o.orderNumber)}` },
    },
  };
}

export function membershipStartedEmail(m: { site: string; firstName: string | null; planName: string; amountMinor: number; renewsOn: Date }): Email {
  return {
    subject: "Welcome to Loamy membership",
    parts: {
      preheader: "Your garden, care tasks and Ask Loamy are ready.",
      heading: `Welcome${m.firstName ? `, ${esc(m.firstName)}` : ""}. Let’s grow.`,
      body: [
        "Your membership is active. Your growing plans, daily care tasks and Ask Loamy are all unlocked.",
        emailRows([[esc(m.planName), formatNaira(m.amountMinor)]], ["Renews", dateFmt.format(m.renewsOn)]),
        "It renews automatically until you cancel. You can cancel any time from your profile, and you keep access until the end of the period you’ve paid for.",
      ],
      button: { label: "Open my garden", url: `${m.site}/garden` },
    },
  };
}

export function membershipRenewedEmail(m: { site: string; firstName: string | null; planName: string; amountMinor: number; renewsOn: Date }): Email {
  return {
    subject: "Your Loamy membership renewed",
    parts: {
      preheader: `Paid ${formatNaira(m.amountMinor)}. Next renewal ${dateFmt.format(m.renewsOn)}.`,
      heading: "Membership renewed",
      body: [
        `Thanks for growing with us${m.firstName ? `, ${esc(m.firstName)}` : ""}.`,
        emailRows([[esc(m.planName), formatNaira(m.amountMinor)]], ["Next renewal", dateFmt.format(m.renewsOn)]),
      ],
      button: { label: "Open my garden", url: `${m.site}/garden` },
      footnote: `Don’t want to renew next time? Cancel from your <a href="${m.site}/profile" style="color:#0A0A0A">profile</a> before then.`,
    },
  };
}

export function refundEmail(r: { site: string; firstName: string | null; orderNumber: string; amountMinor: number; full: boolean }): Email {
  return {
    subject: `Refund for order ${r.orderNumber}`,
    parts: {
      preheader: `${formatNaira(r.amountMinor)} is on its way back to you.`,
      heading: "We’ve sent your refund",
      body: [
        `We’ve refunded <strong>${formatNaira(r.amountMinor)}</strong>${r.full ? "" : " (part of the order)"} for order <strong>${esc(r.orderNumber)}</strong>.`,
        "It goes back to the card or account you paid with. Banks usually take up to 10 working days to show it.",
      ],
      button: { label: "View your order", url: `${r.site}/orders/${encodeURIComponent(r.orderNumber)}` },
      footnote: "Questions? Just reply to this email.",
    },
  };
}
