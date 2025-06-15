export function formatDate(date: string) {
  return new Date(date).toLocaleDateString();
}

export function truncate(text: string, maxLength = 100) {
  return text.length > maxLength ? text.slice(0, maxLength) + "..." : text;
}
