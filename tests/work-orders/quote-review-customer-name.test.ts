import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync(
  "features/work-orders/app/work-orders/quote-review/page.tsx",
  "utf8",
);

describe("quote review queue customer identity", () => {
  it("loads customer identity instead of shop identity for review cards", () => {
    expect(page).toContain(
      "customers(name,first_name,last_name,business_name,identity_name)",
    );
    expect(page).toContain("function customerDisplayName");
    expect(page).toContain("{customerDisplayName(w)}");
    expect(page).not.toContain("{w.shops?.name ||");
  });

  it("searches by customer name", () => {
    expect(page).toContain("const customerName = customerDisplayName(w).toLowerCase()");
    expect(page).toContain("customerName.includes(qlc)");
  });
});
