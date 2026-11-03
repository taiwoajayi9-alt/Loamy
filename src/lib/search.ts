/** Turns a search box entry into a safe ILIKE pattern, so % and _ typed by a shopper match literally. */
export function likeTerm(q: string): string {
  return `%${q.trim().slice(0, 64).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
