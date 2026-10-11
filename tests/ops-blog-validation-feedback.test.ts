import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("app/api/ops/blog/articles/route.ts", "utf8");

describe("Ops blog validation feedback", () => {
  it("returns actionable validation errors instead of a generic invalid article message", () => {
    expect(route).toContain("Add a title before saving this article");
    expect(route).toContain("Add a valid URL slug before saving this article");
    expect(route).toContain("Add an author before saving this article");
    expect(route).toContain("Add a category before saving this article");
    expect(route).not.toContain('{ error: "Invalid article"');
  });
});
