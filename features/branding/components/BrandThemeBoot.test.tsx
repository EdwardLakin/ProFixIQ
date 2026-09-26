import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import BrandThemeBoot from "./BrandThemeBoot";
import type { ActiveBrandPayload } from "@/features/branding/hooks/useActiveBrand";

const mocks = vi.hoisted(() => ({
  useActiveBrand: vi.fn(),
}));

vi.mock("@/features/branding/hooks/useActiveBrand", () => ({
  useActiveBrand: mocks.useActiveBrand,
}));

function mockBrand(payload: ActiveBrandPayload) {
  mocks.useActiveBrand.mockReturnValue({
    data: payload,
    loading: false,
    reload: vi.fn(),
  });
}

function panelVar(): string {
  return document.documentElement.style.getPropertyValue(
    "--mobile-surface-panel",
  );
}

describe("BrandThemeBoot mobile card-surface bridge", () => {
  afterEach(() => {
    cleanup();
    document.documentElement.style.removeProperty("--mobile-surface-panel");
    document.documentElement.removeAttribute("data-theme-mode");
    vi.clearAllMocks();
  });

  it("syncs --mobile-surface-panel from a shop's card_background in dark mode", async () => {
    mockBrand({
      ok: true,
      profile: {
        theme_mode: "dark",
        card_background: "#FFFFFF",
        text_primary: "#102A43",
      },
    });

    render(<BrandThemeBoot />);

    await waitFor(() => {
      expect(panelVar()).toBe("#FFFFFF");
    });
  });

  it("does not override the panel surface in light mode", async () => {
    mockBrand({
      ok: true,
      profile: {
        theme_mode: "light",
        card_background: "#FFFFFF",
        text_primary: "#102A43",
      },
    });

    render(<BrandThemeBoot />);

    await waitFor(() => {
      expect(document.documentElement.getAttribute("data-theme-mode")).toBe(
        "light",
      );
    });
    expect(panelVar()).toBe("");
  });

  it("clears a stale override when a later profile has no card_background", async () => {
    mockBrand({
      ok: true,
      profile: { theme_mode: "dark", card_background: "#FFFFFF" },
    });
    const { rerender } = render(<BrandThemeBoot />);
    await waitFor(() => expect(panelVar()).toBe("#FFFFFF"));

    mockBrand({
      ok: true,
      profile: { theme_mode: "dark", card_background: null },
    });
    rerender(<BrandThemeBoot />);

    await waitFor(() => expect(panelVar()).toBe(""));
  });
});
