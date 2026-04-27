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

const DOMAIN_HINTS: Array<{ domain: OnboardingDomain; hints: string[] }> = [
  { domain: "customers", hints: ["customer id", "customer name", "full name", "company", "email", "phone"] },
  { domain: "vehicles", hints: ["vin", "plate", "license", "year", "make", "model", "unit", "customer id"] },
  { domain: "history", hints: ["work order", "repair order", "ro", "complaint", "cause", "correction", "labor", "total"] },
  { domain: "invoices", hints: ["invoice", "invoice number", "amount", "payment status", "paid", "closed", "work order"] },
  { domain: "parts", hints: ["part", "sku", "part number", "description", "cost", "price", "qty"] },
  { domain: "vendors", hints: ["vendor", "supplier", "company", "vendor phone", "vendor email"] },
  { domain: "staff", hints: ["employee", "staff", "technician", "advisor", "role", "email"] },
  { domain: "inspections", hints: ["inspection", "checklist", "item", "condition"] },
  { domain: "menu", hints: ["service menu", "service", "package", "labor op"] },
];

export function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

export function detectDomain(input: { filename?: string | null; headers?: string[] }): OnboardingDomain {
  const filename = normalizeHeader(input.filename ?? "");
  const headers = (input.headers ?? []).map(normalizeHeader);
  const corpus = [filename, ...headers].join(" | ");

  let best: { domain: OnboardingDomain; score: number } = { domain: "unknown", score: 0 };
  for (const candidate of DOMAIN_HINTS) {
    const score = candidate.hints.reduce((acc, hint) => (corpus.includes(hint) ? acc + 1 : acc), 0);
    if (score > best.score) best = { domain: candidate.domain, score };
  }

  return best.score > 0 ? best.domain : "unknown";
}
