import { beforeEach, describe, expect, it, vi } from "vitest";
import { activateOnboardingVendors, computeVendorActivationResult } from "@/features/onboarding-agent/server/activateOnboardingVendors";

vi.mock("@/features/onboarding-agent/server/assertOnboardingSessionOwnership", () => ({
  assertOnboardingSessionOwnership: vi.fn().mockResolvedValue(undefined),
}));

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

function createFakeSupabase(params?: { entities?: Entity[]; suppliers?: Supplier[] }) {
  const state = {
    entities: [...(params?.entities ?? [])],
    suppliers: [...(params?.suppliers ?? [])],
    nextSupplierId: 100,
    insertCalls: 0,
    updateCalls: 0,
    writes: [] as string[],
  };

  return {
    state,
    from(table: string) {
      const query: any = {
        table,
        filters: [] as Array<{ k: string; v: any }>,
        payload: null as any,
        selectColumns: "",
        update(payload: any) {
          this.payload = payload;
          this.op = "update";
          return this;
        },
        insert(payload: any) {
          this.payload = payload;
          this.op = "insert";
          return this;
        },
        select(columns: string) {
          this.selectColumns = columns;
          this.op = this.op ?? "select";
          return this;
        },
        order() {
          return this;
        },
        eq(k: string, v: any) {
          this.filters.push({ k, v });
          return this;
        },
        single() {
          return this.execSingle();
        },
        then(resolve: any, reject: any) {
          return this.exec().then(resolve, reject);
        },
        async execSingle() {
          const result = await this.exec();
          const first = Array.isArray(result.data) ? result.data[0] ?? null : result.data ?? null;
          return { ...result, data: first };
        },
        async exec() {
          if (this.table === "onboarding_entities" && this.op === "select") {
            let rows = [...state.entities];
            for (const filter of this.filters) rows = rows.filter((row: any) => row[filter.k] === filter.v);
            return { data: rows, error: null };
          }

          if (this.table === "suppliers" && this.op === "select") {
            let rows = [...state.suppliers];
            for (const filter of this.filters) rows = rows.filter((row: any) => row[filter.k] === filter.v);
            return { data: rows, error: null };
          }

          if (this.table === "suppliers" && this.op === "insert") {
            state.insertCalls += 1;
            state.writes.push("suppliers:insert");
            const created = {
              id: `supplier-${state.nextSupplierId++}`,
              created_at: new Date().toISOString(),
              created_by: this.payload.created_by ?? null,
              is_active: this.payload.is_active ?? true,
              notes: this.payload.notes ?? null,
              ...this.payload,
            };
            state.suppliers.push(created);
            return { data: [{ id: created.id }], error: null };
          }

          if (this.table === "suppliers" && this.op === "update") {
            state.updateCalls += 1;
            state.writes.push("suppliers:update");
            const target = state.suppliers.find((row: any) => this.filters.every((f: any) => row[f.k] === f.v));
            if (target) Object.assign(target, this.payload);
            return { data: [], error: null };
          }

          return { data: [], error: null };
        },
      };

      return query;
    },
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
      entities: [entity({ normalized: { name: "North Supply", accountNumber: "ACCT-44", email: "new@north.test", phone: "111-222-3333", notes: "Preferred" } })],
      supplierRows: [supplier({ id: "supplier-1", name: "North Supply", email: "existing@north.test", phone: null, account_no: "ACCT-44", notes: null })],
    });

    expect(result.updated).toBe(1);
    expect(result.preparedUpdates).toHaveLength(1);
    expect(result.preparedUpdates[0]?.payload).toEqual({ phone: "111-222-3333", notes: "Preferred" });
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
    expect(result.warnings).toHaveLength(1);
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

describe("activateOnboardingVendors", () => {
  let sb: ReturnType<typeof createFakeSupabase>;

  beforeEach(() => {
    const stagedVendors = Array.from({ length: 10 }).map((_, index) =>
      entity({
        id: `entity-${index + 1}`,
        normalized: { name: `Vendor ${index + 1}`, email: `vendor${index + 1}@test.com`, account_no: `ACCT-${index + 1}` },
      }),
    );
    sb = createFakeSupabase({ entities: stagedVendors, suppliers: [] });
  });

  it("creates suppliers from 10 ready staged vendors and is idempotent on rerun", async () => {
    const first = await activateOnboardingVendors({
      supabase: sb as any,
      shopId: "shop-1",
      sessionId: "session-1",
      actorId: "user-1",
    });

    expect(first.ok).toBe(true);
    expect(first.stagedVendorsFound).toBe(10);
    expect(first.suppliersBefore).toBe(0);
    expect(first.suppliersAfter).toBe(10);
    expect(first.inserted).toBe(10);
    expect(first.updated).toBe(0);
    expect(first.skipped).toBe(0);

    const second = await activateOnboardingVendors({
      supabase: sb as any,
      shopId: "shop-1",
      sessionId: "session-1",
      actorId: "user-1",
    });

    expect(second.inserted).toBe(0);
    expect(second.updated).toBe(0);
    expect(second.skipped).toBe(10);
    expect(second.suppliersBefore).toBe(10);
    expect(second.suppliersAfter).toBe(10);
  });

  it("only writes to suppliers table and ignores non-ready/non-vendor/cross-shop rows", async () => {
    sb = createFakeSupabase({
      suppliers: [],
      entities: [
        entity({ id: "vendor-ready", normalized: { name: "Vendor A" } }),
        entity({ id: "wrong-shop", shop_id: "shop-2", normalized: { name: "Vendor B" } }),
        entity({ id: "wrong-session", session_id: "session-2", normalized: { name: "Vendor C" } }),
        entity({ id: "not-ready", status: "needs_review", normalized: { name: "Vendor D" } }),
        entity({ id: "not-vendor", entity_type: "vehicle", normalized: { name: "Truck" } }),
      ],
    });

    const result = await activateOnboardingVendors({
      supabase: sb as any,
      shopId: "shop-1",
      sessionId: "session-1",
      actorId: "user-1",
    });

    expect(result.stagedVendorsFound).toBe(1);
    expect(result.inserted).toBe(1);
    expect(sb.state.writes.every((entry) => entry.startsWith("suppliers:"))).toBe(true);
  });
});
