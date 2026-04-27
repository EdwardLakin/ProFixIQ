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

  it("keeps service catalog in menu domain even with price columns", () => {
    expect(detectDomain({ filename: "service_catalog.csv", headers: ["Service Name", "Price", "Labor Hours"] })).toBe("menu");
  });

  it("keeps vendors in vendors domain even with email/phone", () => {
    expect(detectDomain({ filename: "vendors.csv", headers: ["Company", "Email", "Phone"] })).toBe("vendors");
  });

  it("keeps staff files in staff domain even with email/phone", () => {
    expect(detectDomain({ filename: "staff_users.csv", headers: ["Full Name", "Email", "Phone"] })).toBe("staff");
  });
});
