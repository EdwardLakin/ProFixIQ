import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PAGE_PATH = resolve(process.cwd(), "app/parts/vendors/page.tsx");

describe("vendor directory redesign", () => {
  it("keeps operational vendor work on the page and routes integrations to owner settings", async () => {
    const source = await readFile(PAGE_PATH, "utf8");

    expect(source).toContain("Needs attention");
    expect(source).toContain("Supplier records");
    expect(source).toContain("Vendor profile");
    expect(source).toContain("/dashboard/owner/settings#settings-integrations");
    expect(source).not.toContain("PartsTech");
    expect(source).not.toContain("Direct supplier ordering");
  });

  it("uses structured vendor flags for actionable filters and profile health", async () => {
    const source = await readFile(PAGE_PATH, "utf8");

    expect(source).toContain("row.setup.possibleDuplicate");
    expect(source).toContain("row.setup.missingContact");
    expect(source).toContain("row.setup.hasLegacyVendorText");
  });

  it("provides a sticky desktop profile and a fixed mobile drawer", async () => {
    const source = await readFile(PAGE_PATH, "utf8");

    expect(source).toContain('mobileOpen ? "fixed" : "hidden"');
    expect(source).toContain("lg:sticky");
    expect(source).toContain("h-[calc(100vh-8rem)]");
  });
});
