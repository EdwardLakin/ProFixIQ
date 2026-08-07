import React from "react";
import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import PricingSection from "@/features/shared/components/ui/PricingSection";

const pricingSource = readFileSync(
  "features/shared/components/ui/PricingSection.tsx",
  "utf8",
);
const pricingStyles = readFileSync(
  "features/shared/components/ui/PricingSection.module.css",
  "utf8",
);
const comparePlansSource = readFileSync("app/compare-plans/page.tsx", "utf8");
const landingSource = readFileSync(
  "features/shared/components/ProFixIQLanding.tsx",
  "utf8",
);

const themeBlock = (surface: "light" | "dark") => {
  const match = pricingStyles.match(
    new RegExp(`\\.root\\[data-surface="${surface}"\\] \\{([\\s\\S]*?)\\n\\}`),
  );
  expect(match, `missing ${surface} pricing theme`).not.toBeNull();
  return match?.[1] ?? "";
};

const tokenHex = (block: string, token: string) => {
  const match = block.match(new RegExp(`${token}:\\s*(#[0-9a-f]{6})`, "i"));
  expect(match, `missing hex value for ${token}`).not.toBeNull();
  return match?.[1] ?? "#000000";
};

const relativeLuminance = (hex: string) => {
  const channels =
    hex
      .slice(1)
      .match(/.{2}/g)
      ?.map((channel) => Number.parseInt(channel, 16) / 255) ?? [];
  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

const contrastRatio = (foreground: string, background: string) => {
  const lighter = Math.max(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );
  const darker = Math.min(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );
  return (lighter + 0.05) / (darker + 0.05);
};

describe("PricingSection theme contract", () => {
  it("requires callers to choose a surface and exposes it to styling", () => {
    const onCheckout = vi.fn();
    const { rerender } = render(
      <PricingSection
        surface="dark"
        onCheckout={onCheckout}
        onStartFree={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("region", { name: "Pricing plans" }),
    ).toHaveAttribute("data-surface", "dark");

    rerender(
      <PricingSection
        surface="light"
        onCheckout={onCheckout}
        onStartFree={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("region", { name: "Pricing plans" }),
    ).toHaveAttribute("data-surface", "light");
    expect(
      screen.getAllByRole("button", { name: "Start 14-day free trial" }),
    ).toHaveLength(2);
  });

  it("keeps text readable on both explicit card surfaces", () => {
    for (const surface of ["light", "dark"] as const) {
      const block = themeBlock(surface);
      const cardBackground = tokenHex(block, "--pricing-card-bg");

      for (const textToken of [
        "--pricing-primary-text",
        "--pricing-muted-text",
        "--pricing-accent-text",
      ]) {
        expect(
          contrastRatio(tokenHex(block, textToken), cardBackground),
          `${surface} ${textToken} contrast`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("themes the complete pricing interaction instead of overriding text alone", () => {
    expect(pricingStyles).toContain('.root[data-surface="light"]');
    expect(pricingStyles).toContain('.root[data-surface="dark"]');
    expect(pricingStyles).toContain(".button:focus-visible");
    expect(pricingStyles).toContain(".button:disabled");
    expect(pricingStyles).toContain(".primaryButton:hover:not(:disabled)");
    expect(pricingStyles).toContain(".secondaryButton:hover:not(:disabled)");
    expect(pricingStyles).toContain(".badge");
    expect(pricingStyles).toContain(".divider");
    expect(pricingStyles).toContain(".featureIcon");
    expect(pricingStyles).toContain(".notice");
    expect(pricingSource).not.toContain("var(--marketing-");
    expect(pricingSource).not.toContain("bg-white");
  });

  it("pins the landing and compare-plans callers to their intended themes", () => {
    expect(landingSource).toMatch(/<PricingSection surface="light"/);
    expect(comparePlansSource).toMatch(/<PricingSection\s+surface="dark"/);
  });
});
