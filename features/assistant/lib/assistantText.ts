import type { AssistantAnswer } from "@/features/agent/assistant/types";

function normalizeComparable(value: string): string {
  return value
    .toLowerCase()
    .replace(/[•*_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[.!?]+$/g, "")
    .trim();
}

function splitSentences(value: string): string[] {
  return value
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function collapseRepeatedHalf(value: string): string {
  const words = value.split(/\s+/).filter(Boolean);
  if (words.length < 10 || words.length % 2 !== 0) return value;

  const midpoint = words.length / 2;
  const first = words.slice(0, midpoint).join(" ");
  const second = words.slice(midpoint).join(" ");
  return normalizeComparable(first) === normalizeComparable(second) ? first : value;
}

export function dedupeAssistantText(value: string): string {
  const compact = collapseRepeatedHalf(value.replace(/\s+/g, " ").trim());
  const sentences = splitSentences(compact);
  if (sentences.length <= 1) return compact;

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const sentence of sentences) {
    const key = normalizeComparable(sentence);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(sentence);
  }

  return unique.join(" ").trim();
}

export function dedupeAssistantBullets(
  summary: string,
  bullets: string[],
  limit = 6,
): string[] {
  const summaryKey = normalizeComparable(summary);
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const raw of bullets) {
    const bullet = dedupeAssistantText(raw);
    const key = normalizeComparable(bullet);
    if (!key || key === summaryKey || seen.has(key)) continue;
    seen.add(key);
    unique.push(bullet);
    if (unique.length >= limit) break;
  }

  return unique;
}

export function normalizeShopAssistantAnswer(
  answer: AssistantAnswer,
): AssistantAnswer {
  const summary = dedupeAssistantText(answer.summary);
  const bullets = dedupeAssistantBullets(summary, answer.bullets ?? []);

  return {
    ...answer,
    summary,
    bullets,
  };
}

export function assistantAnswerTranscriptText(answer: AssistantAnswer): string {
  return [answer.summary, ...dedupeAssistantBullets(answer.summary, answer.bullets)]
    .filter(Boolean)
    .join("\n");
}
