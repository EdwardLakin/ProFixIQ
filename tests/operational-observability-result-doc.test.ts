import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const result = readFileSync(
  "docs/ops/operational-observability-implementation-result.md",
  "utf8",
);

describe("operational observability result record", () => {
  it("documents all P0 through P4 boundaries and approval stops", () => {
    for (const phase of ["P0", "P1", "P2", "P3", "P4"]) {
      expect(result).toContain(`${phase} —`);
    }
    expect(result).toContain("No production migration was run");
    expect(result).toContain("No production data was modified");
    expect(result).toContain("No deployment was triggered");
    expect(result).toContain("No pull request was merged");
  });
});
