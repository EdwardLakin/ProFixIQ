import { detectDomain } from "./domains";
import { ONBOARDING_DOMAINS, type OnboardingDomain } from "./domains";

const VALID_DECLARED_DOMAINS = new Set<OnboardingDomain>(ONBOARDING_DOMAINS);

export function detectFileDomain(params: { filename?: string | null; headers?: string[]; declaredDomain?: string | null }) {
  if (params.declaredDomain && VALID_DECLARED_DOMAINS.has(params.declaredDomain as OnboardingDomain) && params.declaredDomain !== "unknown") {
    return params.declaredDomain;
  }
  return detectDomain({ filename: params.filename, headers: params.headers });
}
