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

  it("keeps the primary job actions fixed to the visual viewport", () => {
    const dock = ruleBody(mobileWorkCommandCss, actionDockSelector);

    expect(dock).toContain("position: fixed;");
    expect(dock).toContain("bottom: calc(0.7rem + env(safe-area-inset-bottom, 0px));");
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
