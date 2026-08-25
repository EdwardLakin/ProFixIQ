import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mobileLayout = readFileSync("app/mobile/layout.tsx", "utf8");
const mobileCommandCss = readFileSync("app/mobile/mobile-command.css", "utf8");
const mobileCommandOverridesCss = readFileSync(
  "app/mobile/mobile-command-overrides.css",
  "utf8",
);
const mobileWorkCommandCss = readFileSync(
  "app/mobile/mobile-work-command.css",
  "utf8",
);
const standaloneJobPage = readFileSync(
  "app/mobile/jobs/[lineId]/page.tsx",
  "utf8",
);
const mobileWorkOrderClient = readFileSync(
  "features/work-orders/mobile/MobileWorkOrderClient.tsx",
  "utf8",
);

function normalizeCss(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function ruleBody(source: string, selector: string): string {
  const normalized = normalizeCss(source);
  const marker = `${selector} {`;
  const start = normalized.indexOf(marker);
  expect(start, `missing CSS rule: ${selector}`).toBeGreaterThanOrEqual(0);
  const bodyStart = start + marker.length;
  const end = normalized.indexOf("}", bodyStart);
  expect(end, `unterminated CSS rule: ${selector}`).toBeGreaterThan(bodyStart);
  return normalized.slice(bodyStart, end).trim();
}

describe("mobile focused-job viewport layout", () => {
  const currentStatePanelSelector =
    ".profixiq-mobile-command .app-shell main.mobile-tech-page > div > .mobile-tech-panel:first-of-type";
  const actionDockSelector =
    `${currentStatePanelSelector} > .flex.flex-col.gap-2`;
  const standaloneRouteSelector =
    ".profixiq-mobile-command .mobile-focused-job-route";
  const standaloneActionDockSelector =
    `${standaloneRouteSelector} .app-shell main.mobile-tech-page > div > .mobile-tech-panel:first-of-type > .flex.flex-col.gap-2`;
  const standalonePageSelector =
    `${standaloneRouteSelector} .app-shell main.mobile-tech-page`;

  it("keeps inline work-order primary actions at the base viewport offset", () => {
    const dock = ruleBody(mobileWorkCommandCss, actionDockSelector);

    expect(dock).toContain("position: fixed;");
    expect(dock).toContain("bottom: calc(0.7rem + env(safe-area-inset-bottom, 0px));");
  });

  it("moves standalone job actions above the story rail using one safe-area offset", () => {
    expect(standaloneJobPage).toContain(
      'className="mobile-focused-job-route pb-20"',
    );
    expect(standaloneJobPage).toContain(
      "mobile-focused-job-story-rail fixed",
    );
    expect(mobileWorkOrderClient).not.toContain("mobile-focused-job-route");

    const route = ruleBody(mobileWorkCommandCss, standaloneRouteSelector);
    expect(route).toContain(
      "--mobile-job-primary-dock-bottom: calc( 4.2625rem + max(0.75rem, env(safe-area-inset-bottom, 0px)) );",
    );
    expect(route).toContain(
      "--mobile-job-workflow-bottom-safe-zone: calc( var(--mobile-job-primary-dock-bottom) + 8.75rem );",
    );

    const dock = ruleBody(
      mobileWorkCommandCss,
      standaloneActionDockSelector,
    );
    expect(dock).toContain(
      "bottom: var(--mobile-job-primary-dock-bottom);",
    );

    const page = ruleBody(mobileWorkCommandCss, standalonePageSelector);
    expect(page).toContain(
      "padding-bottom: var(--mobile-job-workflow-bottom-safe-zone) !important;",
    );
  });

  it("prevents the current-state panel from becoming the WebKit fixed-position containing block", () => {
    const sharedPanelRule = ruleBody(
      mobileCommandCss,
      ".profixiq-mobile-command .metal-panel, .profixiq-mobile-command .metal-card, .profixiq-mobile-command .mobile-tech-panel, .profixiq-mobile-command .mobile-tech-subpanel, .profixiq-mobile-command .mobile-command-panel, .profixiq-mobile-command .mobile-command-row",
    );
    expect(sharedPanelRule).toContain("backdrop-filter: blur(18px);");

    const focusedPanelOverride = ruleBody(
      mobileCommandOverridesCss,
      currentStatePanelSelector,
    );
    expect(focusedPanelOverride).toContain(
      "-webkit-backdrop-filter: none !important;",
    );
    expect(focusedPanelOverride).toContain("backdrop-filter: none !important;");
  });

  it("loads the focused-job containment override after the shared mobile surface styles", () => {
    const baseIndex = mobileLayout.indexOf('import "./mobile-command.css";');
    const overrideIndex = mobileLayout.indexOf(
      'import "./mobile-command-overrides.css";',
    );

    expect(baseIndex).toBeGreaterThanOrEqual(0);
    expect(overrideIndex).toBeGreaterThan(baseIndex);
  });
});
