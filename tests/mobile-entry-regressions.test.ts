import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const technicianCopilotShell = readFileSync(
  "features/copilot/technician/components/TechnicianCopilotShell.tsx",
  "utf8",
);
const signInChooser = readFileSync("app/sign-in/page.tsx", "utf8");

describe("mobile entry regressions", () => {
  it("does not force-mount the closed mobile CoPilot modal", () => {
    expect(technicianCopilotShell).toContain("<DialogContent");
    expect(technicianCopilotShell).not.toContain("forceMount");
  });

  it("offers a dedicated Shop Mobile sign-in choice", () => {
    expect(signInChooser).toContain('surface: "mobile"');
    expect(signInChooser).toContain('href: "/mobile/sign-in"');
    expect(signInChooser).toContain('title: "Shop Mobile"');
  });
});
