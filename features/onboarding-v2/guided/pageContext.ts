import { getGuidedOnboardingStep } from "./steps";
import type { GuidedOnboardingStepDefinition, GuidedOnboardingStepKey } from "./types";

export type GuidedPageContext = {
  sessionId: string;
  stepKey: GuidedOnboardingStepKey;
  step: GuidedOnboardingStepDefinition;
  returnTo: string;
  highlight: string | null;
};

type QueryLike = URLSearchParams | ReadonlyURLSearchParamsLike | Record<string, string | string[] | undefined | null> | null | undefined;

type ReadonlyURLSearchParamsLike = {
  get(name: string): string | null;
};

const DEFAULT_RETURN_PREFIX = "/dashboard/onboarding-v2/";

function readQueryValue(query: QueryLike, key: string): string | null {
  if (!query) return null;
  if (typeof (query as ReadonlyURLSearchParamsLike).get === "function") {
    return (query as ReadonlyURLSearchParamsLike).get(key);
  }
  const value = (query as Record<string, string | string[] | undefined | null>)[key];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function cleanSegment(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function sanitizeGuidedReturnTo(value: string | null, sessionId: string): string {
  const fallback = `${DEFAULT_RETURN_PREFIX}${encodeURIComponent(sessionId)}`;
  const trimmed = value?.trim();
  if (!trimmed) return fallback;
  if (!trimmed.startsWith("/")) return fallback;
  if (trimmed.startsWith("//")) return fallback;
  if (/^\/\\/u.test(trimmed)) return fallback;
  return trimmed;
}

export function getGuidedStepPageInstructions(stepKey: GuidedOnboardingStepKey): string {
  switch (stepKey) {
    case "customers":
      return "Create a customer, search existing files, or use your stable customer import path if your shop already has records ready.";
    case "vehicles":
      return "Open a customer file and add the vehicles or fleet units that should be ready before advisors build work orders.";
    case "staff":
      return "Provision the user account, choose the initial role, and continue with profile details in People when needed.";
    case "labor_tax_shop_settings":
      return "Review labor rates, tax posture, operating defaults, hours, and shop identity without changing shop context.";
    case "inspection_templates":
      return "Create, clone, or import the inspection templates technicians should use during guided inspections.";
    case "service_menu":
      return "Build or verify common service packages so advisors can quote repeat jobs consistently.";
    case "inventory_parts":
      return "Add parts manually or open the existing CSV import tools to prepare inventory for quoting and receiving.";
    case "invoices":
      return "Review completed, ready-to-invoice, and invoiced work so closeout paperwork is ready before go-live.";
    case "service_history":
      return "Search and review historical work orders or imported service records that should remain visible on customer timelines.";
  }
}

export function parseGuidedPageContext(query: QueryLike): GuidedPageContext | null {
  const sessionId = cleanSegment(readQueryValue(query, "guidedSessionId"));
  const stepKey = cleanSegment(readQueryValue(query, "guidedStep"));
  if (!sessionId || !stepKey) return null;

  const step = getGuidedOnboardingStep(stepKey);
  if (!step) return null;

  return {
    sessionId,
    stepKey: step.key,
    step,
    returnTo: sanitizeGuidedReturnTo(readQueryValue(query, "returnTo"), sessionId),
    highlight: cleanSegment(readQueryValue(query, "highlight")),
  };
}
