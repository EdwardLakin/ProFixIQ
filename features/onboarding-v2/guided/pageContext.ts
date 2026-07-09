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
      return "Import or create your customer records.";
    case "vehicles":
      return "Open a customer file and add the vehicles or fleet units that should be ready before advisors build work orders.";
    case "vehicle_history":
      return "Search and review historical work orders or imported service records that should remain visible on customer and vehicle timelines.";
    case "invoices":
      return "Review completed, ready-to-invoice, and invoiced work so closeout paperwork is ready before go-live.";
    case "parts":
      return "Add parts manually or open the existing CSV import tools to prepare inventory for quoting and receiving.";
    case "shop_settings":
      return "Review shop identity, rates, supplies, hours, and workflow defaults in the focused onboarding Shop Settings card. Staff setup lives later in User Management/Create User.";
    case "analysis":
      return "Review AI recommendations based on imported and configured shop data. Recommendations should guide inspection templates first, then menu items and canned services, inventory, vendors, customer or fleet segments, maintenance packages, and automation rules; they should not auto-create records.";
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
