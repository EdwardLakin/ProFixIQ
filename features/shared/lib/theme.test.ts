import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyThemePreference,
  readThemePreference,
  THEME_CHANGE_EVENT,
} from "@/features/shared/lib/theme";

describe("global theme preference", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("class");
    document.documentElement.removeAttribute("data-theme-mode");
    document.documentElement.removeAttribute("data-theme-preference");
  });

  it("applies and persists light mode through the global attributes", () => {
    const listener = vi.fn();
    window.addEventListener(THEME_CHANGE_EVENT, listener);
    applyThemePreference("light");
    expect(document.documentElement.dataset.themePreference).toBe("light");
    expect(document.documentElement.dataset.themeMode).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(window.localStorage.getItem("pfq-theme-mode")).toBe("light");
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener(THEME_CHANGE_EVENT, listener);
  });

  it("keeps Tailwind dark variants synchronized with dark mode", () => {
    applyThemePreference("dark");
    expect(document.documentElement.dataset.themeMode).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("migrates the legacy toggle storage key", () => {
    window.localStorage.setItem("theme", "light");
    expect(readThemePreference()).toBe("light");
  });
});
