export const ONBOARDING_DOMAINS = [
  "customers",
  "vehicles",
  "history",
  "invoices",
  "parts",
  "vendors",
  "staff",
  "inspections",
  "menu",
  "unknown",
] as const;

export type OnboardingDomain = (typeof ONBOARDING_DOMAINS)[number];

type DomainScore = Record<OnboardingDomain, number>;

export function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

const FILENAME_HINTS: Array<{ domain: OnboardingDomain; hints: string[]; weight: number }> = [
  { domain: "vendors", hints: ["vendor", "vendors", "supplier", "suppliers"], weight: 12 },
  { domain: "staff", hints: ["staff", "users", "employee", "employees", "technician", "tech", "advisor"], weight: 12 },
  { domain: "vehicles", hints: ["vehicle", "vehicles", "vin", "fleet"], weight: 12 },
  { domain: "invoices", hints: ["invoice", "invoices", "billing"], weight: 12 },
  { domain: "history", hints: ["work order", "work orders", "repair order", "ro", "history", "historical"], weight: 12 },
  { domain: "parts", hints: ["parts inventory", "inventory", "sku", "part number", "part"], weight: 12 },
  { domain: "menu", hints: ["service catalog", "service menu", "menu", "labor operation", "canned job"], weight: 14 },
  { domain: "customers", hints: ["customer", "customers"], weight: 9 },
];

const HEADER_HINTS: Array<{ domain: OnboardingDomain; hints: string[]; weight: number }> = [
  { domain: "customers", hints: ["customer id", "customer name", "full name", "company name", "business", "email", "phone"], weight: 3 },
  { domain: "vehicles", hints: ["vehicle id", "vin", "plate", "license", "year", "make", "model", "unit", "customer id"], weight: 3 },
  { domain: "history", hints: ["work order", "repair order", "ro", "complaint", "cause", "correction", "labor", "total", "opened", "closed"], weight: 3 },
  { domain: "invoices", hints: ["invoice", "invoice number", "payment status", "paid", "subtotal", "tax", "work order"], weight: 3 },
  { domain: "parts", hints: ["part", "sku", "part number", "description", "cost", "price", "qty", "on hand"], weight: 3 },
  { domain: "vendors", hints: ["vendor", "supplier", "account number", "vendor phone", "vendor email"], weight: 3 },
  { domain: "staff", hints: ["employee", "staff", "technician", "advisor", "role", "job title", "email"], weight: 3 },
  { domain: "menu", hints: ["service", "service name", "service catalog", "labor operation", "canned job", "labor hours", "labor rate"], weight: 3 },
  { domain: "inspections", hints: ["inspection", "checklist", "condition"], weight: 3 },
];

function tokenizeFilename(filename: string) {
  return normalizeHeader(filename.replace(/\.csv$/i, "")).split(/[^a-z0-9]+/).filter(Boolean);
}

function hasHint(haystack: string, hint: string) {
  const normalizedHint = normalizeHeader(hint);
  return haystack.includes(normalizedHint);
}

export function detectDomain(input: { filename?: string | null; headers?: string[] }): OnboardingDomain {
  const filename = normalizeHeader(input.filename ?? "");
  const filenameTokens = tokenizeFilename(filename).join(" ");
  const headers = (input.headers ?? []).map(normalizeHeader);
  const headerCorpus = headers.join(" | ");

  const scores: DomainScore = {
    customers: 0,
    vehicles: 0,
    history: 0,
    invoices: 0,
    parts: 0,
    vendors: 0,
    staff: 0,
    inspections: 0,
    menu: 0,
    unknown: 0,
  };

  for (const candidate of FILENAME_HINTS) {
    for (const hint of candidate.hints) {
      if (hasHint(filename, hint) || hasHint(filenameTokens, hint)) {
        scores[candidate.domain] += candidate.weight;
      }
    }
  }

  for (const candidate of HEADER_HINTS) {
    for (const hint of candidate.hints) {
      if (hasHint(headerCorpus, hint)) {
        scores[candidate.domain] += candidate.weight;
      }
    }
  }

  const hasToken = (token: string) => filename.includes(token) || filenameTokens.includes(token);
  if (hasToken("service catalog") || hasToken("service menu") || hasToken("catalog") || hasToken("menu")) {
    scores.menu += 20;
    scores.parts = Math.max(0, scores.parts - 10);
  }
  if (hasToken("vendor") || hasToken("supplier")) {
    scores.vendors += 20;
    scores.customers = Math.max(0, scores.customers - 10);
  }
  if (hasToken("staff") || hasToken("users") || hasToken("employees")) {
    scores.staff += 20;
    scores.customers = Math.max(0, scores.customers - 10);
  }
  if (hasToken("invoice")) {
    scores.invoices += 20;
    scores.history = Math.max(0, scores.history - 8);
  }
  if (hasToken("work orders history") || hasToken("work order history") || hasToken("repair order history") || hasToken("history")) {
    scores.history += 20;
    scores.invoices = Math.max(0, scores.invoices - 8);
  }

  if (scores.menu > 0 && scores.parts > 0 && scores.menu >= scores.parts) {
    scores.parts = Math.max(0, scores.parts - 4);
  }

  let bestDomain: OnboardingDomain = "unknown";
  let bestScore = 0;
  for (const domain of ONBOARDING_DOMAINS) {
    if (domain === "unknown") continue;
    if (scores[domain] > bestScore) {
      bestDomain = domain;
      bestScore = scores[domain];
    }
  }

  return bestScore > 0 ? bestDomain : "unknown";
}
