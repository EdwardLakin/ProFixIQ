"use client";

import { useMemo } from "react";

export function useBrandThemeVars() {
  return useMemo(
    () => ({
      primary: "var(--brand-primary, #C97A3D)",
      secondary: "var(--brand-secondary, #0F172A)",
      accent: "var(--brand-accent, #E2A164)",
    }),
    [],
  );
}
