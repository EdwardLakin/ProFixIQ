import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const signInChooser = readFileSync("app/sign-in/page.tsx", "utf8");

describe("mobile entry regressions", () => {
  it("offers a dedicated Shop Mobile sign-in choice", () => {
    expect(signInChooser).toContain('surface: "mobile"');
    expect(signInChooser).toContain('href: "/mobile/sign-in"');
    expect(signInChooser).toContain('title: "Shop Mobile"');
  });
});
