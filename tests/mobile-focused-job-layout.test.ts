import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mobileLayout = readFileSync("app/mobile/layout.tsx", "utf8");
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

  it("keeps the primary work-order actions in normal document flow, not pinned to the viewport", () => {
    const dock = ruleBody(mobileWorkCommandCss, actionDockSelector);

    expect(dock).not.toContain("position: fixed");
    expect(dock).not.toContain("position:fixed");
  });

  it("renders the standalone job's cause-and-correction entry point inline, not as a fixed rail", () => {
    expect(standaloneJobPage).toContain(
      'className="mobile-focused-job-route"',
    );
    expect(standaloneJobPage).toContain("mobile-focused-job-story-rail");
    expect(standaloneJobPage).not.toMatch(
      /mobile-focused-job-story-rail[^"]*\bfixed\b/,
    );
    expect(mobileWorkOrderClient).not.toContain("mobile-focused-job-route");
  });

  it("does not reserve extra page padding for a removed fixed action dock", () => {
    const page = ruleBody(
      mobileWorkCommandCss,
      ".profixiq-mobile-command .app-shell main.mobile-tech-page",
    );
    expect(page).not.toContain("7.6rem");
    expect(page).not.toContain("!important");
  });

  it("loads the focused-job containment override after the shared mobile surface styles", () => {
    const baseIndex = mobileLayout.indexOf('import "./mobile-command.css";');
    const overrideIndex = mobileLayout.indexOf(
      'import "./mobile-command-overrides.css";',
    );

    expect(baseIndex).toBeGreaterThanOrEqual(0);
    expect(overrideIndex).toBeGreaterThan(baseIndex);
  });

  it("no longer neutralizes backdrop-filter to protect a fixed-position containing block", () => {
    // That workaround existed only because the action dock above was
    // position: fixed inside a blurred panel. With the dock back in normal
    // flow there is nothing left pinning it, so the override should be gone.
    expect(mobileCommandOverridesCss).not.toContain(
      "fixed-position containing block",
    );
  });
});
