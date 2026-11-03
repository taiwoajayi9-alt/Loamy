/**
 * Business details used in the Terms and Privacy notice.
 * OWNER: replace the bracketed values, have a Nigerian lawyer review both pages, then set `reviewed: true`
 * to remove the "draft" banner. Bump POLICY_VERSION in src/server/auth.ts when the wording changes materially.
 */
export const LEGAL = {
  reviewed: false,
  effective: "3 November 2026",
  businessName: "[Registered business name]",
  registration: "[CAC registration number]",
  address: "[Registered address], Lagos, Nigeria",
  email: "loamy.farm@gmail.com",
  privacyEmail: "loamy.farm@gmail.com",
  phone: "[Support phone or WhatsApp number]",
  /** Window for reporting a damaged or wrong item. */
  damagedReportHours: 48,
  /** Change-of-mind returns for unused, non-living items. Live plants and seedlings are excluded. */
  changeOfMindDays: 7,
} as const;
