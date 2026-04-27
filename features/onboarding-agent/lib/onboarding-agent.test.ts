import { describe, expect, it } from "vitest";
import { buildDryRunActivationPlan } from "@/features/onboarding-agent/lib/activationPlan";
import { parseCsvText } from "@/features/onboarding-agent/lib/csvParsing";
import { detectDomain } from "@/features/onboarding-agent/lib/domains";
import { normalizeRow } from "@/features/onboarding-agent/lib/normalization";

describe("onboarding agent helpers", () => {
  it("detects customer domain from headers", () => {
    expect(detectDomain({ filename: "customers.csv", headers: ["Customer ID", "Full NAME", "EMAIL", "Phone Number", "Company Name"] })).toBe("customers");
  });

  it("detects known domain files using filename hints", () => {
    expect(detectDomain({ filename: "vendors.csv", headers: ["Vendor Name", "Vendor Email"] })).toBe("vendors");
    expect(detectDomain({ filename: "staff_users.csv", headers: ["Full Name", "Role", "Email"] })).toBe("staff");
    expect(detectDomain({ filename: "vehicles.csv", headers: ["VIN", "Plate"] })).toBe("vehicles");
    expect(detectDomain({ filename: "invoices.csv", headers: ["Invoice Number", "Total"] })).toBe("invoices");
    expect(detectDomain({ filename: "work_orders_history.csv", headers: ["Work Order", "Complaint"] })).toBe("history");
    expect(detectDomain({ filename: "service_catalog.csv", headers: ["Service Name", "Labor Hours"] })).toBe("menu");
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

  it("normalizes parts/vendors/staff/menu rows", () => {
    expect(normalizeRow("parts", { SKU: "SKU-1", Description: "Filter" }).entityType).toBe("part");
    expect(normalizeRow("vendors", { "Vendor Name": "Acme Supply" }).entityType).toBe("vendor");
    expect(normalizeRow("staff", { Name: "Tech A", Email: "tech@example.com" }).entityType).toBe("staff_candidate");
    expect(normalizeRow("menu", { "Service Name": "Oil Change", "Labor Hours": "1.0" }).entityType).toBe("menu_suggestion");
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
