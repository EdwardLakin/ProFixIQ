import { beforeEach, describe, expect, it, vi } from "vitest";
import { activateOnboardingVendors } from "@/features/onboarding-agent/server/activateOnboardingVendors";

vi.mock("@/features/onboarding-agent/server/assertOnboardingSessionOwnership", () => ({
  assertOnboardingSessionOwnership: vi.fn().mockResolvedValue(undefined),
}));

type Entity = any;
type Supplier = any;

function entity(overrides: Partial<Entity>): Entity {
  return {
    id: "entity-1",
    shop_id: "shop-1",
    session_id: "session-1",
    entity_type: "vendor",
    status: "ready",
    display_name: null,
    source_external_id: null,
    normalized: {},
    ...overrides,
  };
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

function fakeSb(params?: { entities?: Entity[]; suppliers?: Supplier[] }) {
  const state = {
    entities: [...(params?.entities ?? [])],
    suppliers: [...(params?.suppliers ?? [])],
    reviewItems: [] as any[],
  };

  return {
    state,
    from(table: string) {
      const query: any = {
        table,
        filters: [] as Array<{ key: string; value: any }>,
        payload: null as any,
        op: "select",
        select() { return this; },
        order() { return this; },
        eq(key: string, value: any) { this.filters.push({ key, value }); return this; },
        insert(payload: any) { this.op = "insert"; this.payload = payload; return this; },
        update(payload: any) { this.op = "update"; this.payload = payload; return this; },
        upsert(payload: any) { this.op = "upsert"; this.payload = payload; return this.exec(); },
        single() { return this.execSingle(); },
        then(resolve: any, reject: any) { return this.exec().then(resolve, reject); },
        async execSingle() {
          const result = await this.exec();
          const data = Array.isArray(result.data) ? (result.data[0] ?? null) : result.data;
          return { ...result, data };
        },
        async exec() {
          if (table === "onboarding_entities") {
            let rows = [...state.entities];
            for (const f of this.filters) rows = rows.filter((row) => row[f.key] === f.value);
            return { data: rows, error: null };
          }
          if (table === "suppliers" && this.op === "select") {
            let rows = [...state.suppliers];
            for (const f of this.filters) rows = rows.filter((row) => row[f.key] === f.value);
            return { data: rows, error: null };
          }
          if (table === "suppliers" && this.op === "insert") {
            const created = { ...this.payload, id: `supplier-${state.suppliers.length + 1}`, created_at: new Date().toISOString() };
            state.suppliers.push(created);
            return { data: [{ id: created.id }], error: null };
          }
          if (table === "suppliers" && this.op === "update") {
            const target = state.suppliers.find((row) => this.filters.every((f: any) => row[f.key] === f.value));
            if (target) Object.assign(target, this.payload);
            return { data: [], error: null };
          }
          if (table === "suppliers" && this.filters.length === 1 && this.filters[0]?.key === "shop_id" && this.payload === null) {
            return { count: state.suppliers.length, error: null };
          }
          if (table === "onboarding_review_items") {
            state.reviewItems.push(...(Array.isArray(this.payload) ? this.payload : [this.payload]));
            return { data: [], error: null };
          }
          return { data: [], error: null };
        },
      };
      return query;
    },
  };
}

describe("activateOnboardingVendors", () => {
  let sb: ReturnType<typeof fakeSb>;

  beforeEach(() => {
    sb = fakeSb({ entities: [entity({ normalized: { name: "Vendor A" } })] });
  });

  it("creates vendor once then rerun matches existing", async () => {
    const first = await activateOnboardingVendors({ supabase: sb as any, shopId: "shop-1", sessionId: "session-1", actorId: "user-1" });
    const second = await activateOnboardingVendors({ supabase: sb as any, shopId: "shop-1", sessionId: "session-1", actorId: "user-1" });

    expect(first.created).toBe(1);
    expect(second.created).toBe(0);
    expect(second.matchedExisting + second.updatedNullOnly).toBe(1);
  });

  it("writes review item for missing vendor name", async () => {
    sb = fakeSb({ entities: [entity({ id: "entity-missing", normalized: {} })] });
    const result = await activateOnboardingVendors({ supabase: sb as any, shopId: "shop-1", sessionId: "session-1", actorId: "user-1" });
    expect(result.needsReview).toBeGreaterThan(0);
    expect(sb.state.reviewItems.some((item) => item.issue_type === "missing_vendor_name")).toBe(true);
  });

  it("null-only updates existing matched supplier", async () => {
    sb = fakeSb({
      entities: [entity({ normalized: { name: "North Supply", phone: "555-1234" } })],
      suppliers: [supplier({ name: "North Supply", phone: null })],
    });
    const result = await activateOnboardingVendors({ supabase: sb as any, shopId: "shop-1", sessionId: "session-1", actorId: "user-1" });
    expect(result.updatedNullOnly).toBe(1);
    expect(sb.state.suppliers[0].phone).toBe("555-1234");
  });
});
