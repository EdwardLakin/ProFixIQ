"use client";

import { useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { getGuidedOnboardingStep, isGuidedOnboardingStepKey } from "./steps";
import { parseGuidedPageContext, type GuidedPageContext } from "./pageContext";
import type { GuidedOnboardingStepKey } from "./types";
import {
  isSafeGuidedReturnTo,
  parseGuidedOnboardingQuery,
  type GuidedOnboardingQuery,
} from "./query";

const STORAGE_KEY = "profixiq:guided-onboarding:v2:active-context";
const STORAGE_TTL_MS = 1000 * 60 * 60 * 24;
const GUIDED_PARAM_KEYS = ["setup", "guidedSessionId", "guidedStep", "focus", "returnTo", "highlight"] as const;

type SavedGuidedContext = {
  setup: "guided";
  guidedSessionId: string;
  guidedStep: GuidedOnboardingStepKey;
  returnTo: string;
  highlight: string;
  focus?: string;
  savedAt: number;
};

const STEP_PATH_PREFIXES: Record<GuidedOnboardingStepKey, string[]> = {
  customers: ["/customers"],
  vehicles: ["/vehicles"],
  vehicle_history: ["/work-orders/history"],
  invoices: ["/billing"],
  parts: ["/parts/inventory"],
  staff: ["/dashboard/owner/create-user"],
  pricing_shop_defaults: ["/dashboard/owner/settings"],
  analysis: ["/dashboard/onboarding-v2"],
};

function canUseStorage(): boolean {
  return typeof window !== "undefined";
}

function readSavedGuidedContext(): SavedGuidedContext | null {
  if (!canUseStorage()) return null;
  const raw = window.sessionStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SavedGuidedContext>;
    if (parsed.setup !== "guided") return null;
    if (!parsed.guidedSessionId || !parsed.guidedStep || !parsed.highlight) return null;
    if (!isGuidedOnboardingStepKey(parsed.guidedStep)) return null;
    if (!isSafeGuidedReturnTo(parsed.returnTo)) return null;
    if (Date.now() - Number(parsed.savedAt ?? 0) > STORAGE_TTL_MS) return null;
    return parsed as SavedGuidedContext;
  } catch {
    return null;
  }
}

function writeSavedGuidedContext(context: SavedGuidedContext): void {
  if (!canUseStorage()) return;
  const raw = JSON.stringify(context);
  window.sessionStorage.setItem(STORAGE_KEY, raw);
  window.localStorage.setItem(STORAGE_KEY, raw);
}

function pathMatchesGuidedStep(pathname: string, stepKey: GuidedOnboardingStepKey): boolean {
  return STEP_PATH_PREFIXES[stepKey].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function toSavedContext(query: GuidedOnboardingQuery, params: URLSearchParams): SavedGuidedContext | null {
  if (!isGuidedOnboardingStepKey(query.onboardingStep)) return null;
  const step = getGuidedOnboardingStep(query.onboardingStep);
  if (!step) return null;
  return {
    setup: "guided",
    guidedSessionId: query.onboardingSession,
    guidedStep: query.onboardingStep,
    returnTo: query.returnTo,
    highlight: query.highlight,
    focus: params.get("focus") ?? step.highlightQuery?.focus,
    savedAt: Date.now(),
  };
}

function buildRestoredSearch(params: URLSearchParams, saved: SavedGuidedContext): string {
  const next = new URLSearchParams(params.toString());
  next.set("setup", "guided");
  next.set("guidedSessionId", saved.guidedSessionId);
  next.set("guidedStep", saved.guidedStep);
  next.set("returnTo", saved.returnTo);
  next.set("highlight", saved.highlight);
  if (saved.focus) next.set("focus", saved.focus);
  return next.toString();
}

export function clearSavedGuidedOnboardingContext(): void {
  if (!canUseStorage()) return;
  window.sessionStorage.removeItem(STORAGE_KEY);
  window.localStorage.removeItem(STORAGE_KEY);
}

export function usePersistentGuidedOnboardingQuery(expectedStep?: GuidedOnboardingStepKey): GuidedOnboardingQuery | null {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();

  const parsed = useMemo(() => parseGuidedOnboardingQuery(new URLSearchParams(search)), [search]);

  useEffect(() => {
    const params = new URLSearchParams(search);
    if (parsed) {
      const saved = toSavedContext(parsed, params);
      if (saved) writeSavedGuidedContext(saved);
      return;
    }

    if (params.has("setup") && params.get("setup") !== "guided") return;
    if (GUIDED_PARAM_KEYS.some((key) => params.has(key))) return;

    const saved = readSavedGuidedContext();
    if (!saved) return;
    if (expectedStep && saved.guidedStep !== expectedStep) return;
    if (!pathMatchesGuidedStep(pathname, saved.guidedStep)) return;

    const restored = buildRestoredSearch(params, saved);
    router.replace(`${pathname}?${restored}`, { scroll: false });
  }, [expectedStep, parsed, pathname, router, search]);

  if (parsed && (!expectedStep || parsed.onboardingStep === expectedStep)) return parsed;
  return null;
}

export function usePersistentGuidedPageContext(): GuidedPageContext | null {
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  usePersistentGuidedOnboardingQuery();
  return useMemo(() => parseGuidedPageContext(new URLSearchParams(search)), [search]);
}
