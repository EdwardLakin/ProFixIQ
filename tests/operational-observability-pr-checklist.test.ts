import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const checklist = readFileSync(
  "docs/ops/operational-observability-pr-checklist.md",
  "utf8",
);

describe("operational observability release checklist", () => {
  it("keeps consequential release actions explicitly incomplete", () => {
    expect(checklist).toContain("- [ ] Isolated Supabase branch migration apply");
    expect(checklist).toContain("- [ ] Direct database same-shop/cross-shop authorization tests");
    expect(checklist).toContain("- [ ] Mobile and desktop runtime smoke tests");
    expect(checklist).toContain("- [ ] Explicit production migration approval");
  });
});
