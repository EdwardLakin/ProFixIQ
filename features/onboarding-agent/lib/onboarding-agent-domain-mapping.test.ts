import { describe, expect, it } from "vitest";
import { detectDomain } from "@/features/onboarding-agent/lib/domains";

const fixtures: Array<{ filename: string; expected: string }> = [
  { filename: "customers.csv", expected: "customers" },
  { filename: "vehicles.csv", expected: "vehicles" },
  { filename: "work_orders_history.csv", expected: "history" },
  { filename: "invoices.csv", expected: "invoices" },
  { filename: "parts_inventory.csv", expected: "parts" },
  { filename: "vendors.csv", expected: "vendors" },
  { filename: "staff_users.csv", expected: "staff" },
  { filename: "service_catalog.csv", expected: "menu" },
];

describe("onboarding known file domain mapping", () => {
  it("maps known fixture filenames to expected domains", () => {
    for (const fixture of fixtures) {
      expect(detectDomain({ filename: fixture.filename, headers: [] })).toBe(fixture.expected);
    }
  });
});
