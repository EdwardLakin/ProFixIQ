import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("app/parts/movements/page.tsx", "utf8");

describe("stock movement ledger UI", () => {
  it("uses readable direction language and high-contrast movement badges", () => {
    expect(source).toContain('label: "Stock in"');
    expect(source).toContain('label: "Stock out"');
    expect(source).toContain('label: "No change"');
    expect(source).toContain("text-rose-800");
    expect(source).toContain("dark:text-rose-100");
    expect(source).toContain("text-sm font-bold tabular-nums");
    expect(source).not.toContain("bg-rose-950/20 text-rose-200");
  });

  it("provides summary filters, search, and responsive ledger layouts", () => {
    expect(source).toContain('aria-label="Movement filters"');
    expect(source).toContain("aria-pressed={active}");
    expect(source).toContain(
      'placeholder="Search part, SKU, location, source, work order…',
    );
    expect(source).toContain('className="space-y-3 xl:hidden"');
    expect(source).toContain(
      'className="desktop-panel-soft hidden overflow-hidden xl:block"',
    );
  });

  it("distinguishes zero-value audit records from stock received", () => {
    expect(source).toContain('if (qty > 0) return "in"');
    expect(source).toContain('if (qty < 0) return "out"');
    expect(source).toContain('return "unchanged"');
  });
});
