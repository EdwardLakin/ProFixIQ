"use client";

import { useEffect, useState } from "react";
import { FiMoon, FiSun } from "react-icons/fi";

type Theme = "light" | "dark";

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  // 1) user-set value wins
  const stored = window.localStorage.getItem("theme");
  if (stored === "light" || stored === "dark") return stored;
  // 2) otherwise follow system
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  return prefersDark ? "dark" : "light";
}

export default function ThemeToggleButton() {
  const [theme, setTheme] = useState<Theme>(() => getInitialTheme());

  // apply to <html>
  useEffect(() => {
    if (typeof window === "undefined") return;
    const root = document.documentElement;

    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    window.localStorage.setItem("theme", theme);
  }, [theme]);

  const toggle = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/5 bg-black/10 text-sm text-white/80 shadow-sm transition hover:border-white/20 hover:bg-white/5 dark:bg-white/5 dark:text-white/90"
    >
      {theme === "dark" ? <FiSun className="h-4 w-4" /> : <FiMoon className="h-4 w-4" />}
    </button>
  );
}