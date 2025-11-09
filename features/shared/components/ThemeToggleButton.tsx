// features/shared/components/ThemeToggleButton.tsx
"use client";

import { useEffect, useState } from "react";
import { FiMoon, FiSun } from "react-icons/fi";

type Theme = "light" | "dark";

function getPreferredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = window.localStorage.getItem("theme");
  if (stored === "light" || stored === "dark") return stored;
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  return prefersDark ? "dark" : "light";
}

export default function ThemeToggleButton() {
  const [theme, setTheme] = useState<Theme>("dark");

  // hydrate from localStorage / system
  useEffect(() => {
    const initial = getPreferredTheme();
    setTheme(initial);
    const root = document.documentElement;
    if (initial === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
  }, []);

  // whenever theme changes, update html + localStorage
  useEffect(() => {
    if (typeof window === "undefined") return;
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    window.localStorage.setItem("theme", theme);
  }, [theme]);

  return (
    <button
      type="button"
      onClick={() => setTheme((p) => (p === "dark" ? "light" : "dark"))}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-black/20 text-sm text-white/80 shadow-sm transition hover:border-accent hover:text-white dark:bg-white/10"
    >
      {theme === "dark" ? <FiSun className="h-4 w-4" /> : <FiMoon className="h-4 w-4" />}
    </button>
  );
}