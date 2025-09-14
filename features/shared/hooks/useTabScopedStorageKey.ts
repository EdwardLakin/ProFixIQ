"use client";

import { useMemo } from "react";
import { useTabs } from "@/features/shared/components/tabs/TabsProvider";

/** Builds a stable localStorage key namespaced to the currently active tab. */
export function useTabScopedStorageKey(base: string): string {
  const { activeHref } = useTabs();
  return useMemo(() => `${base}:${activeHref || "global"}`, [base, activeHref]);
}