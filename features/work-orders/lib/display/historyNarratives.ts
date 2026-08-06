export type HistoryNarratives = {
  complaint: string | null;
  cause: string | null;
  correction: string | null;
};

function clean(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function resolveHistoryNarratives(input: {
  description?: string | null;
  symptom?: string | null;
  cause?: string | null;
  correction?: string | null;
}): HistoryNarratives {
  const descriptionParts = (input.description ?? "")
    .split(/\s+\/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const hasLegacyStructuredDescription = descriptionParts.length >= 2;

  return {
    complaint:
      clean(input.symptom) ??
      (hasLegacyStructuredDescription ? descriptionParts[0] : null),
    cause:
      clean(input.cause) ??
      (hasLegacyStructuredDescription ? descriptionParts[1] : null),
    correction:
      clean(input.correction) ??
      (descriptionParts.length >= 3
        ? descriptionParts.slice(2).join(" / ")
        : null),
  };
}
