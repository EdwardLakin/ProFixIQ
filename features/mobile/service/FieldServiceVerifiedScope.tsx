"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { OfflineMutationScope } from "@/features/shared/lib/offline/mutations";

const FieldServiceVerifiedScopeContext =
  createContext<OfflineMutationScope | null>(null);

export function FieldServiceVerifiedScopeProvider({
  children,
  scope,
}: {
  children: ReactNode;
  scope: OfflineMutationScope;
}) {
  return (
    <FieldServiceVerifiedScopeContext.Provider value={scope}>
      {children}
    </FieldServiceVerifiedScopeContext.Provider>
  );
}

export function useFieldServiceVerifiedScope(): OfflineMutationScope {
  const scope = useContext(FieldServiceVerifiedScopeContext);
  if (!scope) {
    throw new Error("Field Service scope has not been verified.");
  }
  return scope;
}
