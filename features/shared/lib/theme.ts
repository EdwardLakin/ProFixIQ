export const THEME_STORAGE_KEY = "pfq-theme-mode";
export const THEME_CHANGE_EVENT = "profixiq:theme-change";

export type ThemePreference = "dark" | "light" | "system";
export type ResolvedTheme = Exclude<ThemePreference, "system">;

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "dark" || value === "light" || value === "system";
}

export function resolveThemePreference(
  preference: ThemePreference,
  prefersDark?: boolean,
): ResolvedTheme {
  if (preference !== "system") return preference;
  const systemPrefersDark =
    prefersDark ??
    (typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  return systemPrefersDark ? "dark" : "light";
}

export function readThemePreference(): ThemePreference {
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (isThemePreference(stored)) return stored;
  const legacy = window.localStorage.getItem("theme");
  return legacy === "light" || legacy === "dark" ? legacy : "dark";
}

export function applyThemePreference(
  preference: ThemePreference,
  options: { persist?: boolean; notify?: boolean } = {},
): ResolvedTheme {
  const resolved = resolveThemePreference(preference);
  const root = document.documentElement;
  root.setAttribute("data-theme-preference", preference);
  root.setAttribute("data-theme-mode", resolved);
  root.classList.toggle("dark", resolved === "dark");
  root.style.colorScheme = resolved;

  if (options.persist !== false) {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    window.localStorage.removeItem("theme");
  }
  if (options.notify !== false) {
    window.dispatchEvent(
      new CustomEvent(THEME_CHANGE_EVENT, { detail: { preference, resolved } }),
    );
  }
  return resolved;
}
