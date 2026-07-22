import { normalizeVinInput } from "@/features/shared/lib/vin/normalizeVin";

const VIN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2] as const;

const VIN_TRANSLITERATION: Readonly<Record<string, number>> = {
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  E: 5,
  F: 6,
  G: 7,
  H: 8,
  J: 1,
  K: 2,
  L: 3,
  M: 4,
  N: 5,
  P: 7,
  R: 9,
  S: 2,
  T: 3,
  U: 4,
  V: 5,
  W: 6,
  X: 7,
  Y: 8,
  Z: 9,
};

export type VinCaptureCandidate = {
  vin: string;
  checksumValid: boolean;
  score: number;
};

export type StableVinResult = VinCaptureCandidate & {
  matches: number;
  requiredMatches: number;
};

function transliterateVinCharacter(character: string): number | null {
  if (/^[0-9]$/.test(character)) return Number(character);
  return VIN_TRANSLITERATION[character] ?? null;
}

export function calculateVinCheckDigit(input: unknown): string | null {
  const normalized = normalizeVinInput(input);
  if (!normalized.isValid) return null;

  let total = 0;
  for (let index = 0; index < normalized.vin.length; index += 1) {
    const value = transliterateVinCharacter(normalized.vin[index]);
    if (value === null) return null;
    total += value * VIN_WEIGHTS[index];
  }

  const remainder = total % 11;
  return remainder === 10 ? "X" : String(remainder);
}

export function hasValidVinChecksum(input: unknown): boolean {
  const normalized = normalizeVinInput(input);
  if (!normalized.isValid) return false;
  const expected = calculateVinCheckDigit(normalized.vin);
  return expected !== null && normalized.vin[8] === expected;
}

function addCandidate(
  values: Map<string, VinCaptureCandidate>,
  rawCandidate: string,
  exactLength: boolean,
) {
  const normalized = normalizeVinInput(rawCandidate);
  if (!normalized.isValid) return;

  const checksumValid = hasValidVinChecksum(normalized.vin);
  const score = (checksumValid ? 100 : 0) + (exactLength ? 20 : 0);
  const current = values.get(normalized.vin);

  if (!current || score > current.score) {
    values.set(normalized.vin, {
      vin: normalized.vin,
      checksumValid,
      score,
    });
  }
}

export function extractVinCandidates(input: unknown): VinCaptureCandidate[] {
  const raw = String(input ?? "").trim().toUpperCase().slice(0, 256);
  if (!raw) return [];

  const candidates = new Map<string, VinCaptureCandidate>();
  addCandidate(candidates, raw, true);

  const compact = raw.replace(/[^A-Z0-9]/g, "");
  if (compact.length === 17) {
    addCandidate(candidates, compact, true);
  } else if (compact.length > 17) {
    for (let index = 0; index <= compact.length - 17; index += 1) {
      addCandidate(candidates, compact.slice(index, index + 17), false);
    }
  }

  const tokenMatches = raw.match(/[A-HJ-NPR-Z0-9]{17}/g) ?? [];
  tokenMatches.forEach((match) => addCandidate(candidates, match, true));

  return [...candidates.values()].sort(
    (left, right) => right.score - left.score || left.vin.localeCompare(right.vin),
  );
}

export function chooseStableVin(
  observations: readonly string[],
  options?: {
    checksumMatches?: number;
    repeatedMatches?: number;
  },
): StableVinResult | null {
  const checksumMatches = Math.max(1, options?.checksumMatches ?? 2);
  const repeatedMatches = Math.max(checksumMatches, options?.repeatedMatches ?? 3);
  const counts = new Map<string, { candidate: VinCaptureCandidate; matches: number }>();

  observations.forEach((observation) => {
    extractVinCandidates(observation).forEach((candidate) => {
      const current = counts.get(candidate.vin);
      counts.set(candidate.vin, {
        candidate,
        matches: (current?.matches ?? 0) + 1,
      });
    });
  });

  const ranked = [...counts.values()].sort((left, right) => {
    if (left.candidate.checksumValid !== right.candidate.checksumValid) {
      return left.candidate.checksumValid ? -1 : 1;
    }
    return right.matches - left.matches || right.candidate.score - left.candidate.score;
  });

  for (const entry of ranked) {
    const requiredMatches = entry.candidate.checksumValid
      ? checksumMatches
      : repeatedMatches;
    if (entry.matches >= requiredMatches) {
      return {
        ...entry.candidate,
        matches: entry.matches,
        requiredMatches,
      };
    }
  }

  return null;
}
