import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * These routes/components previously hard-coded a dark slate palette (or
 * white-alpha washes) and ignored the light/dark toggle. They must stay on the
 * shared --theme-* tokens so both themes read well.
 */
const THEME_AWARE_FILES = [
  "app/offline/page.tsx",
  "app/offline/sync/page.tsx",
  "app/launch/page.tsx",
  "features/shared/components/pwa/PwaRuntime.tsx",
  "features/inspections/lib/inspection/PauseResume.tsx",
  "features/inspections/lib/inspection/StartListeningButton.tsx",
  "features/fleet/components/FleetNotificationsBell.tsx",
  "features/fleet/components/FleetUnitsPage.tsx",
  "features/fleet/components/FleetServiceRequestsPage.tsx",
  "features/fleet/components/FleetBillingWorkspace.tsx",
  "features/fleet/components/FleetPmProgramEditor.tsx",
  "features/customers/components/CustomerAccountDetails.tsx",
  "features/ops/components/OpsSystemHealth.tsx",
  "features/customers/app/customers/[id]/page.tsx",
  "features/work-orders/quote-review/PricingQuarantineRemediation.tsx",
];

describe("theme toggle surfaces", () => {
  it.each(THEME_AWARE_FILES)("%s uses theme tokens, not fixed dark palette", (file) => {
    const source = readFileSync(file, "utf8");
    expect(source).not.toMatch(/\b(?:bg|border)-slate-(?:600|700|800|900)\b|\btext-slate-(?:100|200|300|400|500)\b|\bbg-slate-950(?![/\d])/);
    expect(source).not.toMatch(/\bhover:bg-white\/\[?[\d.]+\]?/);
  });
});

describe("pale status text stays readable in light mode", () => {
  // Pale -50..-300 text utilities are only legible on dark panels. Outside
  // `rounded` pills the shared light-mode overrides do not catch them, so each
  // use needs a paired `dark:` variant (or a solid saturated background).
  const PALE_TEXT =
    /(?<![\w:/\[-])text-(?:sky|amber|emerald|red|rose|cyan|blue|orange|yellow|green)-(?:50|100|200|300)\b/;

  it.each(THEME_AWARE_FILES)("%s pairs pale text with a dark: variant", (file) => {
    const offenders = readFileSync(file, "utf8")
      .split("\n")
      .filter(
        (line) =>
          PALE_TEXT.test(line) &&
          !line.includes("dark:text-"),
      );
    expect(offenders).toEqual([]);
  });
});

describe("inspection voice controls button", () => {
  it("uses theme tokens instead of white-alpha washes", () => {
    const source = readFileSync("features/inspections/screens/GenericInspectionScreen.tsx", "utf8");
    expect(source).not.toContain("border-white/20 bg-white/5 text-[11px] font-semibold text-white");
  });
});
