"use client";

import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import {
  readThemePreference,
  resolveThemePreference,
  THEME_CHANGE_EVENT,
  type ResolvedTheme,
} from "@/features/shared/lib/theme";

export default function ThemedToaster() {
  const [theme, setTheme] = useState<ResolvedTheme>("dark");

  useEffect(() => {
    const sync = () => setTheme(resolveThemePreference(readThemePreference()));
    sync();
    window.addEventListener(THEME_CHANGE_EVENT, sync);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, sync);
  }, []);

  return (
    <Toaster
      position="bottom-center"
      theme={theme}
      richColors
      toastOptions={{
        style: {
          background: "var(--theme-surface-overlay)",
          border: "1px solid var(--theme-border-soft)",
          color: "var(--theme-text-primary)",
        },
      }}
    />
  );
}
