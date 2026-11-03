/**
 * Business details used in the Terms and Privacy notice.
 * OWNER: business name, CAC number and address are left out for now (owner decision 2026-11-03); add them, have a Nigerian lawyer review both pages, then set `reviewed: true`
 * to remove the "draft" banner. Bump POLICY_VERSION in src/server/auth.ts when the wording changes materially.
 */
export const LEGAL = {
  reviewed: false,
  effective: "3 November 2026",
  email: "loamy.farm@gmail.com",
  privacyEmail: "loamy.farm@gmail.com",
  instagram: "loamy.farm",
  /** Window for reporting a damaged or wrong item. */
  damagedReportHours: 48,
  /** Change-of-mind returns for unused, non-living items. Live plants and seedlings are excluded. */
  changeOfMindDays: 7,
} as const;
