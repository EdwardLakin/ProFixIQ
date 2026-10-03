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
];

describe("theme toggle surfaces", () => {
  it.each(THEME_AWARE_FILES)("%s uses theme tokens, not fixed dark palette", (file) => {
    const source = readFileSync(file, "utf8");
    expect(source).not.toMatch(/\b(?:bg|border)-slate-(?:600|700|800|900)\b|\btext-slate-(?:100|200|300|400|500)\b|\bbg-slate-950(?![/\d])/);
    expect(source).not.toMatch(/\bhover:bg-white\/\[?[\d.]+\]?/);
  });
});
