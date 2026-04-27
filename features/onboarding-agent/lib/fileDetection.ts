import { detectDomain } from "./domains";
import { ONBOARDING_DOMAINS, type OnboardingDomain } from "./domains";

const VALID_DECLARED_DOMAINS = new Set<OnboardingDomain>(ONBOARDING_DOMAINS);

export function detectFileDomain(params: { filename?: string | null; headers?: string[]; declaredDomain?: string | null }) {
  const deterministic = detectDomain({ filename: params.filename, headers: params.headers });
  const declared = params.declaredDomain as OnboardingDomain | null | undefined;

  if (declared && VALID_DECLARED_DOMAINS.has(declared) && declared !== "unknown") {
    if (deterministic === "unknown" || deterministic === declared) return declared;
  }

  return deterministic;
}
