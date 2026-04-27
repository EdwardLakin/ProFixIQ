import { describe, expect, it } from "vitest";
import { buildDryRunActivationPlan } from "@/features/onboarding-agent/lib/activationPlan";
import { parseCsvText } from "@/features/onboarding-agent/lib/csvParsing";
import { detectDomain } from "@/features/onboarding-agent/lib/domains";
import { normalizeRow } from "@/features/onboarding-agent/lib/normalization";

describe("onboarding agent helpers", () => {
  it("detects customer domain from headers", () => {
    expect(detectDomain({ filename: "customers.csv", headers: ["Customer ID", "Full NAME", "EMAIL", "Phone Number", "Company Name"] })).toBe("customers");
  });

  it("parses csv with mixed-case headers", () => {
    const parsed = parseCsvText("Customer ID,Full NAME,EMAIL\n1,Jane Doe,jane@example.com");
    expect(parsed.headers).toEqual(["Customer ID", "Full NAME", "EMAIL"]);
    expect(parsed.rows[0]["Full NAME"]).toBe("Jane Doe");
  });

  it("normalizes vehicle/history/invoice rows", () => {
    const vehicle = normalizeRow("vehicles", { VIN: " 1hgcm82633a004352 ", Plate: "ca 123", "Customer ID": "C-1", Year: "2020", Make: "Ford", Model: "F150" });
    expect((vehicle.normalized as any).vin).toBe("1HGCM82633A004352");

    const history = normalizeRow("history", { "Work Order": "RO-9", "Customer ID": "C-1", "Vehicle ID": "V-1", Complaint: "noise", Labor: "100", Total: "500" });
    expect(history.entityType).toBe("historical_work_order");

    const invoice = normalizeRow("invoices", { Invoice: "INV-1", "Work Order": "RO-9", Total: "500", Status: "closed" });
    expect(invoice.entityType).toBe("historical_invoice");
  });

  it("builds dry-run activation plan", () => {
    const plan = buildDryRunActivationPlan({
      sessionId: "s-1",
      entityCounts: { customer: 2, vehicle: 1, historical_work_order: 3, historical_invoice: 1 },
      linkCounts: { customer_vehicle: 1 },
      reviewBlocking: 2,
      reviewNonBlocking: 1,
    });
    expect(plan.mode).toBe("dry_run");
    expect(plan.creates.customers).toBe(2);
    expect(plan.review.blocking).toBe(2);
  });
});
