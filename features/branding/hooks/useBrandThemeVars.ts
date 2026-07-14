"use client";

import { useMemo } from "react";

export function useBrandThemeVars() {
  return useMemo(
    () => ({
      primary: "var(--brand-primary, #C97A3D)",
      secondary: "var(--brand-secondary, var(--theme-surface-page))",
      accent: "var(--brand-accent, #E2A164)",
    }),
    [],
  );
}
