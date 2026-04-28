import { describe, expect, it } from "vitest";
import { computeVendorActivationResult } from "@/features/onboarding-agent/server/activateOnboardingVendors";

type Entity = Parameters<typeof computeVendorActivationResult>[0]["entities"][number];
type Supplier = Parameters<typeof computeVendorActivationResult>[0]["supplierRows"][number];

function entity(overrides: Partial<Entity>): Entity {
  return {
    id: "entity-1",
    shop_id: "shop-1",
    session_id: "session-1",
    entity_type: "vendor",
    status: "ready",
    display_name: null,
    normalized: {},
    ...overrides,
  } as Entity;
}

function supplier(overrides: Partial<Supplier>): Supplier {
  return {
    id: "supplier-1",
    shop_id: "shop-1",
    name: "North Supply",
    account_no: null,
    email: null,
    phone: null,
    notes: null,
    is_active: true,
    created_at: new Date().toISOString(),
    created_by: null,
    ...overrides,
  };
}

describe("computeVendorActivationResult", () => {
  it("inserts suppliers for ready staged vendor entities", () => {
    const result = computeVendorActivationResult({
      shopId: "shop-1",
      sessionId: "session-1",
      entities: [entity({ normalized: { name: "North Supply", email: "orders@north.test" } })],
      supplierRows: [],
    });

    expect(result.inserted).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.preparedInserts).toHaveLength(1);
  });

  it("rerun does not duplicate suppliers because name match resolves to existing", () => {
    const result = computeVendorActivationResult({
      shopId: "shop-1",
      sessionId: "session-1",
      entities: [entity({ normalized: { name: "North Supply" } })],
      supplierRows: [supplier({ id: "supplier-1", name: "North Supply" })],
    });

    expect(result.inserted).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.records[0]?.reason).toContain("already has mapped fields");
  });

  it("updates only null-safe fields on existing supplier matches", () => {
    const result = computeVendorActivationResult({
      shopId: "shop-1",
      sessionId: "session-1",
      entities: [entity({ normalized: { name: "North Supply", accountNumber: "ACCT-44", email: "new@north.test", phone: "111-222-3333" } })],
      supplierRows: [supplier({ id: "supplier-1", name: "North Supply", email: "existing@north.test", phone: null, account_no: null })],
    });

    expect(result.updated).toBe(1);
    expect(result.preparedUpdates).toHaveLength(1);
    expect(result.preparedUpdates[0]?.payload).toEqual({ account_no: "ACCT-44", phone: "111-222-3333" });
  });

  it("ignores cross-shop entities and non-ready/non-vendor rows", () => {
    const result = computeVendorActivationResult({
      shopId: "shop-1",
      sessionId: "session-1",
      entities: [
        entity({ id: "entity-cross-shop", shop_id: "shop-2", normalized: { name: "Wrong Shop" } }),
        entity({ id: "entity-wrong-session", session_id: "session-2", normalized: { name: "Wrong Session" } }),
        entity({ id: "entity-not-ready", status: "needs_review", normalized: { name: "Needs Review" } }),
        entity({ id: "entity-not-vendor", entity_type: "customer", normalized: { name: "Customer Co" } }),
      ],
      supplierRows: [],
    });

    expect(result.inserted).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(0);
  });

  it("skips ambiguous matches and returns warnings", () => {
    const result = computeVendorActivationResult({
      shopId: "shop-1",
      sessionId: "session-1",
      entities: [entity({ normalized: { name: "North Supply" } })],
      supplierRows: [supplier({ id: "supplier-1", name: "North Supply" }), supplier({ id: "supplier-2", name: "North Supply" })],
    });

    expect(result.inserted).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(1);
    expect(result.warnings).toBe(1);
    expect(result.records[0]?.reason).toContain("Ambiguous");
  });

  it("analyze/rerun guarantee: activation result is empty when no ready vendor entities are present", () => {
    const result = computeVendorActivationResult({
      shopId: "shop-1",
      sessionId: "session-1",
      entities: [entity({ entity_type: "part", status: "ready", normalized: { name: "Brake Pad" } })],
      supplierRows: [],
    });

    expect(result.inserted).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.records).toHaveLength(0);
  });
});
