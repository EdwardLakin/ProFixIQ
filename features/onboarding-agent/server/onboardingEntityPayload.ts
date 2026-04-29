type JsonObject = Record<string, unknown>;
type EntityShape = {
  normalized?: unknown;
  details?: unknown;
  payload?: unknown;
  source_row_id?: unknown;
  source_external_id?: unknown;
  display_name?: unknown;
};

function asObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonObject;
}

export function buildOnboardingEntityPayloadLayers(entity: EntityShape | null | undefined): JsonObject[] {
  const normalized = asObject(entity?.normalized);
  const normalizedDetails = asObject(normalized?.details);
  const normalizedPayload = asObject(normalized?.payload);
  const normalizedDetailsPayload = asObject(normalizedDetails?.payload);
  const details = asObject(entity?.details);
  const payload = asObject(entity?.payload);

  const topLevel: JsonObject = {
    source_row_id: entity?.source_row_id ?? null,
    sourceRowId: entity?.source_row_id ?? null,
    source_external_id: entity?.source_external_id ?? null,
    sourceExternalId: entity?.source_external_id ?? null,
    display_name: entity?.display_name ?? null,
    displayName: entity?.display_name ?? null,
  };

  return [normalized, normalizedDetails, normalizedPayload, normalizedDetailsPayload, details, payload, topLevel].filter(Boolean) as JsonObject[];
}

export function firstTextFromLayers(layers: JsonObject[], aliases: string[]): { value: string | null; alias: string | null } {
  for (const layer of layers) {
    for (const alias of aliases) {
      const value = String(layer[alias] ?? "").trim();
      if (value) return { value, alias };
    }
  }
  return { value: null, alias: null };
}

export function keysSampleFromLayers(layers: JsonObject[], max = 25): string[] {
  const out: string[] = [];
  for (const layer of layers) {
    for (const key of Object.keys(layer)) {
      if (!out.includes(key)) out.push(key);
      if (out.length >= max) return out;
    }
  }
  return out;
}
