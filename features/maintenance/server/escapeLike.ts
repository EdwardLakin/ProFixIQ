/** Escape `%`, `_` and `\` so a value matches literally in an ilike pattern. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
