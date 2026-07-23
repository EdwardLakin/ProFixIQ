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

const OCR_CHARACTER_OPTIONS: Readonly<Record<string, readonly string[]>> = {
  O: ["0"],
  Q: ["0"],
  I: ["1"],
  B: ["B", "8"],
  "8": ["8", "B"],
  G: ["G", "6"],
  "6": ["6", "G"],
  S: ["S", "5"],
  "5": ["5", "S"],
  Z: ["Z", "2"],
  "2": ["2", "Z"],
  L: ["L", "1"],
  "1": ["1", "L"],
  D: ["D", "0"],
  "0": ["0", "D"],
};

const MAX_OCR_CORRECTIONS = 4;
const MAX_OCR_VARIANTS = 128;
const MAX_OCR_WINDOWS = 160;

export type VinCaptureCandidate = {
  vin: string;
  checksumValid: boolean;
  score: number;
};

export type OcrVinCandidate = VinCaptureCandidate & {
  corrections: number;
  contextBoost: number;
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

function addOcrWindows(
  output: Array<{ value: string; contextBoost: number }>,
  compact: string,
  contextBoost: number,
) {
  if (output.length >= MAX_OCR_WINDOWS) return;
  if (compact.length < 17) return;

  if (compact.length === 17) {
    output.push({ value: compact, contextBoost });
    return;
  }

  const remaining = MAX_OCR_WINDOWS - output.length;
  const windowCount = Math.min(compact.length - 16, remaining);
  for (let index = 0; index < windowCount; index += 1) {
    output.push({ value: compact.slice(index, index + 17), contextBoost });
  }
}

function collectOcrWindows(input: unknown): Array<{ value: string; contextBoost: number }> {
  const raw = String(input ?? "").trim().toUpperCase().slice(0, 2_048);
  if (!raw) return [];

  const windows: Array<{ value: string; contextBoost: number }> = [];
  const chunks = [raw, ...raw.split(/\r?\n/)].filter(Boolean);

  for (const chunk of chunks) {
    if (windows.length >= MAX_OCR_WINDOWS) break;

    const hasVinContext = /\bVIN\b|VEHICLE\s+IDENTIFICATION/.test(chunk);
    const contextBoost = hasVinContext ? 35 : 0;
    const compact = chunk.replace(/[^A-Z0-9]/g, "");

    addOcrWindows(windows, compact, contextBoost);

    const withoutVinLabel = compact.replace(/^VIN/, "");
    if (withoutVinLabel !== compact) {
      addOcrWindows(windows, withoutVinLabel, contextBoost + 15);
    }

    const tokenMatches = chunk.match(/[A-Z0-9][A-Z0-9\s\-_.:/\\|]{15,34}[A-Z0-9]/g) ?? [];
    for (const token of tokenMatches) {
      if (windows.length >= MAX_OCR_WINDOWS) break;
      addOcrWindows(
        windows,
        token.replace(/[^A-Z0-9]/g, ""),
        contextBoost,
      );
    }
  }

  const unique = new Map<string, { value: string; contextBoost: number }>();
  for (const entry of windows) {
    const existing = unique.get(entry.value);
    if (!existing || entry.contextBoost > existing.contextBoost) {
      unique.set(entry.value, entry);
    }
  }
  return [...unique.values()];
}

function buildOcrVariants(value: string): Array<{ value: string; corrections: number }> {
  let states: Array<{ value: string; corrections: number }> = [
    { value: "", corrections: 0 },
  ];

  for (const character of value) {
    const options = OCR_CHARACTER_OPTIONS[character] ?? [character];
    const next = new Map<string, number>();

    for (const state of states) {
      for (const option of options) {
        const corrections = state.corrections + (option === character ? 0 : 1);
        if (corrections > MAX_OCR_CORRECTIONS) continue;

        const candidate = `${state.value}${option}`;
        const prior = next.get(candidate);
        if (prior === undefined || corrections < prior) {
          next.set(candidate, corrections);
        }
      }
    }

    states = [...next.entries()]
      .map(([candidate, corrections]) => ({ value: candidate, corrections }))
      .sort(
        (left, right) =>
          left.corrections - right.corrections || left.value.localeCompare(right.value),
      )
      .slice(0, MAX_OCR_VARIANTS);
  }

  return states;
}

export function extractVinCandidatesFromOcr(input: unknown): OcrVinCandidate[] {
  const candidates = new Map<string, OcrVinCandidate>();

  for (const window of collectOcrWindows(input)) {
    for (const variant of buildOcrVariants(window.value)) {
      const normalized = normalizeVinInput(variant.value);
      if (!normalized.isValid) continue;

      const checksumValid = hasValidVinChecksum(normalized.vin);
      const score =
        (checksumValid ? 250 : 0) +
        window.contextBoost +
        40 -
        variant.corrections * 12;
      const current = candidates.get(normalized.vin);

      if (!current || score > current.score) {
        candidates.set(normalized.vin, {
          vin: normalized.vin,
          checksumValid,
          score,
          corrections: variant.corrections,
          contextBoost: window.contextBoost,
        });
      }
    }
  }

  return [...candidates.values()].sort(
    (left, right) =>
      Number(right.checksumValid) - Number(left.checksumValid) ||
      right.score - left.score ||
      left.corrections - right.corrections ||
      left.vin.localeCompare(right.vin),
  );
}

export function pickBestOcrVin(input: unknown): OcrVinCandidate | null {
  const candidates = extractVinCandidatesFromOcr(input);
  const checksumConfirmed = candidates.find((candidate) => candidate.checksumValid);
  if (checksumConfirmed) return checksumConfirmed;

  // Never invent a non-checksummed VIN through character substitution. Exact OCR
  // output remains available for markets where position nine is not a check digit.
  return candidates.find((candidate) => candidate.corrections === 0) ?? null;
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
