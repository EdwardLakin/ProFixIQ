export type QuoteHistoryCandidate = {
  historyLineId: string;
  workOrderId: string;
  workOrderNumber: string | null;
  description: string;
  completedAt: string;
  mileageDeltaKm: number | null;
  ageDays: number;
};

export type QuoteHistoryMatch = QuoteHistoryCandidate & {
  quoteLineId: string;
  serviceFamily: string;
  reason: string;
};

type ServiceRule = {
  family: string;
  terms: string[];
  excludes?: string[];
  maxKm: number;
  maxDays: number;
};

const RULES: ServiceRule[] = [
  {
    family: "brake fluid",
    terms: ["brake fluid", "brake flush", "hydraulic flush"],
    maxKm: 50_000,
    maxDays: 1460,
  },
  {
    family: "brake friction",
    terms: ["brake pad", "brake shoe", "brake rotor", "brake drum"],
    excludes: ["fluid", "flush"],
    maxKm: 40_000,
    maxDays: 1095,
  },
  {
    family: "engine oil",
    terms: ["oil change", "engine oil", "oil service"],
    maxKm: 16_000,
    maxDays: 550,
  },
  {
    family: "transmission service",
    terms: ["transmission fluid", "transmission service", "trans fluid"],
    maxKm: 80_000,
    maxDays: 1825,
  },
  {
    family: "coolant service",
    terms: ["coolant flush", "coolant service", "antifreeze"],
    maxKm: 80_000,
    maxDays: 1825,
  },
  {
    family: "spark plugs",
    terms: ["spark plug", "ignition tune"],
    maxKm: 120_000,
    maxDays: 2555,
  },
  {
    family: "battery",
    terms: ["battery replacement", "replace battery", "battery install"],
    maxKm: 60_000,
    maxDays: 1460,
  },
  {
    family: "tires",
    terms: ["tire replacement", "replace tire", "new tires"],
    maxKm: 60_000,
    maxDays: 1460,
  },
  {
    family: "alignment",
    terms: ["wheel alignment", "alignment"],
    maxKm: 30_000,
    maxDays: 730,
  },
  {
    family: "filters",
    terms: ["air filter", "cabin filter", "fuel filter"],
    maxKm: 40_000,
    maxDays: 730,
  },
  {
    family: "suspension",
    terms: ["shock", "strut", "control arm", "ball joint"],
    maxKm: 80_000,
    maxDays: 1825,
  },
  {
    family: "abs",
    terms: ["abs sensor", "wheel speed sensor", "abs wiring"],
    maxKm: 50_000,
    maxDays: 1460,
  },
];

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function containsPhrase(value: string, phrase: string): boolean {
  const normalizedValue = ` ${normalize(value)} `;
  const normalizedPhrase = normalize(phrase);
  return Boolean(normalizedPhrase) && normalizedValue.includes(` ${normalizedPhrase} `);
}

function ruleFor(value: string): ServiceRule | null {
  return (
    RULES.find(
      (rule) =>
        rule.terms.some((term) => containsPhrase(value, term)) &&
        !(rule.excludes ?? []).some((term) => containsPhrase(value, term)),
    ) ?? null
  );
}

export function findRelevantHistoryCandidates(input: {
  quoteLineId: string;
  quoteDescription: string;
  candidates: QuoteHistoryCandidate[];
}): QuoteHistoryMatch[] {
  const quoteRule = ruleFor(input.quoteDescription);
  if (!quoteRule) return [];

  return input.candidates
    .filter(
      (candidate) =>
        ruleFor(candidate.description)?.family === quoteRule.family,
    )
    .filter(
      (candidate) =>
        candidate.ageDays <= quoteRule.maxDays &&
        (candidate.mileageDeltaKm == null ||
          (candidate.mileageDeltaKm >= 0 &&
            candidate.mileageDeltaKm <= quoteRule.maxKm)),
    )
    .sort((a, b) => {
      const aScore = a.mileageDeltaKm ?? a.ageDays * 40;
      const bScore = b.mileageDeltaKm ?? b.ageDays * 40;
      return aScore - bScore;
    })
    .slice(0, 4)
    .map((candidate) => ({
      ...candidate,
      quoteLineId: input.quoteLineId,
      serviceFamily: quoteRule.family,
      reason:
        candidate.mileageDeltaKm == null
          ? `Same service family completed ${candidate.ageDays} days ago.`
          : `Same service family completed ${Math.round(candidate.mileageDeltaKm).toLocaleString()} km ago.`,
    }));
}
