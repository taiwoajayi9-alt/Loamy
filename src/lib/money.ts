/** Money is stored as integer kobo. Format for display only; never do arithmetic on formatted strings. */
export function formatNaira(kobo: number): string {
  if (!Number.isInteger(kobo)) throw new Error("Money must be an integer number of kobo.");
  const naira = kobo / 100;
  const hasKobo = kobo % 100 !== 0;
  return (
    "₦" +
    naira.toLocaleString("en-NG", {
      minimumFractionDigits: hasKobo ? 2 : 0,
      maximumFractionDigits: 2,
    })
  );
}

export function nairaToKobo(naira: number): number {
  return Math.round(naira * 100);
}
