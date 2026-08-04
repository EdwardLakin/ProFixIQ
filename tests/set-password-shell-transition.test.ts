import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pagePath = "app/auth/set-password/page.tsx";

function pageSource() {
  return readFileSync(pagePath, "utf8");
}

describe("set-password protected-shell transition", () => {
  it("fails visibly when the profile activation flag cannot be cleared", () => {
    const source = pageSource();

    expect(source).toContain("const { error: profileError } = await supabase");
    expect(source).toContain("if (profileError)");
    expect(source).toContain("account activation failed");
  });

  it("performs a document navigation so the root shell is recalculated", () => {
    const source = pageSource();

    expect(source).toContain("window.location.replace(redirect)");
    expect(source).not.toContain("router.replace(redirect)");
  });
});
