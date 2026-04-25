import { expect } from "vitest";

const BANNED_RESPONSE_KEYS = [
  "metadata",
  "snapshot",
  "payload",
  "preview_payload",
  "intended_mutations",
  "intendedMutations",
  "side_effects",
  "sideEffects",
  "owner_pin",
  "ownerPin",
  "owner_pin_hash",
  "owner_pin_verification_ref",
  "ownerPinProofRef",
  "proofRef",
  "token",
  "secret",
  "password",
  "hash",
  "service_role",
  "authorization",
  "bearer",
  "raw",
  "record",
] as const;

const normalizeKey = (key: string): string => key.toLowerCase().replace(/[^a-z0-9]/g, "");
const normalizedBannedKeySet = new Set(BANNED_RESPONSE_KEYS.map(normalizeKey));

function collectBannedKeys(value: unknown, path = "root"): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectBannedKeys(item, `${path}[${index}]`));
  }

  if (!value || typeof value !== "object") return [];

  return Object.entries(value as Record<string, unknown>).flatMap(([key, nestedValue]) => {
    const currentPath = `${path}.${key}`;
    const hits = normalizedBannedKeySet.has(normalizeKey(key)) ? [currentPath] : [];
    return [...hits, ...collectBannedKeys(nestedValue, currentPath)];
  });
}

export function expectNoBannedDtoKeys(value: unknown): void {
  const hits = collectBannedKeys(value);
  expect(hits, `Found banned DTO keys: ${hits.join(", ")}`).toEqual([]);
}

export function sortedKeys(value: Record<string, unknown>): string[] {
  return Object.keys(value).sort((a, b) => a.localeCompare(b));
}
