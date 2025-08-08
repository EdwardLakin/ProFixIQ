// Combines class names, ignores falsey values
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

// Capitalizes first letter
export function titleCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

// Truncates text
export function truncate(text: string, maxLength: number): string {
  return text.length > maxLength ? text.slice(0, maxLength - 1) + "…" : text;
}

// Current year
export function getCurrentYear(): number {
  return new Date().getFullYear();
}
