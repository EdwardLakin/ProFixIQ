import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const inboxModalSource = readFileSync(
  "features/chat/components/InboxModal.tsx",
  "utf8",
);

function relativeLuminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4,
    );

  if (!channels || channels.length !== 3) {
    throw new Error(`Invalid color: ${hex}`);
  }

  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

describe("Inbox outgoing message contrast", () => {
  it("keeps small outgoing text above WCAG AA contrast in light mode", () => {
    // Tailwind orange-950 on orange-100.
    expect(contrastRatio("#431407", "#ffedd5")).toBeGreaterThanOrEqual(4.5);
  });

  it("uses static light and dark theme classes without render-time media queries", () => {
    expect(inboxModalSource).toContain(
      "border-orange-300 bg-orange-100 text-orange-950 " +
        "dark:border-orange-500/35 dark:bg-orange-500/18 dark:text-orange-50",
    );
    expect(inboxModalSource).not.toContain("window.matchMedia");
  });
});
