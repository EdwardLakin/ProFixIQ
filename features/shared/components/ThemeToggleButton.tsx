// features/shared/components/ThemeTogglebutton
"use client";

import { useEffect, useState } from "react";
import { FiMoon, FiSun } from "react-icons/fi";
import {
  applyThemePreference,
  readThemePreference,
  resolveThemePreference,
  THEME_CHANGE_EVENT,
  type ResolvedTheme,
} from "@/features/shared/lib/theme";

export default function ThemeToggleButton() {
  const [theme, setTheme] = useState<ResolvedTheme>("dark");

  // hydrate from localStorage / system
  useEffect(() => {
    const sync = () => setTheme(resolveThemePreference(readThemePreference()));
    sync();
    window.addEventListener(THEME_CHANGE_EVENT, sync);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, sync);
  }, []);

  return (
    <button
      type="button"
      onClick={() => {
        const next = theme === "dark" ? "light" : "dark";
        applyThemePreference(next);
        setTheme(next);
      }}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] text-sm text-[color:var(--theme-text-secondary)] shadow-sm transition hover:border-accent hover:text-[color:var(--theme-text-primary)] dark:bg-[color:var(--theme-surface-subtle)]"
    >
      {theme === "dark" ? <FiSun className="h-4 w-4" /> : <FiMoon className="h-4 w-4" />}
    </button>
  );
}
