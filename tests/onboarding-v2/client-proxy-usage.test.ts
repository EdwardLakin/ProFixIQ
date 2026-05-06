import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const componentsDir = path.join(process.cwd(), "features/onboarding-v2/components");

describe("client onboarding components use server proxy", () => {
  it("contains no direct Railway/onboarding agent URL", () => {
    const files = fs.readdirSync(componentsDir).filter((f) => f.endsWith(".tsx"));
    for (const file of files) {
      const content = fs.readFileSync(path.join(componentsDir, file), "utf8");
      expect(content.includes("railway")).toBe(false);
      expect(content.includes("ONBOARDING_AGENT_BASE_URL")).toBe(false);
      expect(content.includes("/onboarding/")).toBe(false);
    }
  });
});
