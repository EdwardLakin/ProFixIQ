import { describe, expect, it, vi } from "vitest";
import { activateOnboardingHistory } from "@/features/onboarding-agent/server/activateOnboardingHistory";

vi.mock("@/features/onboarding-agent/server/assertOnboardingSessionOwnership", () => ({
  assertOnboardingSessionOwnership: vi.fn().mockResolvedValue(undefined),
}));

function fakeSb() {
  const reviewScopeKey = (row: any) => [
    row.shop_id ?? "",
    row.session_id ?? "",
    row.domain ?? "",
    row.issue_type ?? "",
    row.severity ?? "",
    JSON.stringify(row.details ?? {}),
  ].join("|");

  const state = {
    entities: [{ id: "h-1", normalized: { sourceWorkOrderId: "RO-1", openedDate: "2022-01-01", customerName: "Acme", vehicleVin: "VIN1", complaint: "Noise" } }] as any[],
    links: [],
    customers: [{ id: "c-1", external_id: null, email: null, name: "Acme", business_name: null }],
    vehicles: [{ id: "v-1", external_id: null, vin: "VIN1", license_plate: null }],
    work_orders: [] as any[],
    lines: [] as any[],
    reviewItems: [] as any[],
  };
  return {
    state,
    from(table: string) {
      const q: any = {
        filters: [] as Array<{ key: string; value: any }>,
        op: "select",
        payload: null as any,
        select() { return this; },
        eq(key: string, value: any) { this.filters.push({ key, value }); return this; },
        in() { return this; },
        order() { return this; },
        insert(payload: any) { this.op = "insert"; this.payload = payload; return this; },
        update(payload: any) { this.op = "update"; this.payload = payload; return this; },
        upsert(payload: any) { this.op = "upsert"; this.payload = payload; return this.exec(); },
        single() { return this.execSingle(); },
        then(resolve: any, reject: any) { return this.exec().then(resolve, reject); },
        async execSingle() { const r = await this.exec(); return { ...r, data: Array.isArray(r.data) ? r.data[0] : r.data }; },
        async exec() {
          if (table === "onboarding_entities") return { data: state.entities, error: null };
          if (table === "onboarding_entity_links") return { data: state.links, error: null };
          if (table === "customers") return { data: state.customers, error: null };
          if (table === "vehicles") return { data: state.vehicles, error: null };
          if (table === "work_orders" && this.op === "select") return { data: state.work_orders, error: null };
          if (table === "work_orders" && this.op === "insert") { const row = { ...this.payload, id: `wo-${state.work_orders.length + 1}` }; state.work_orders.push(row); return { data: [{ id: row.id }], error: null }; }
          if (table === "work_order_lines" && this.op === "insert") { state.lines.push(this.payload); return { data: [], error: null }; }
          if (table === "onboarding_review_items" && this.op === "select") return { data: [...state.reviewItems], error: null };
          if (table === "onboarding_review_items" && this.op === "insert") {
            const row = this.payload;
            const existing = state.reviewItems.find((item) => reviewScopeKey(item) === reviewScopeKey(row));
            if (existing) return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint \"onboarding_review_items_shop_session_issue_scope_uidx\"" } };
            state.reviewItems.push(row);
            return { data: [row], error: null };
          }
          if (table === "onboarding_review_items" && this.op === "update") {
            const target = state.reviewItems.find((item) => this.filters.every((f: any) => item[f.key] === f.value));
            if (target) Object.assign(target, this.payload);
            return { data: [], error: null };
          }
          if (table === "onboarding_review_items" && this.op === "upsert") {
            const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
            for (const row of rows) {
              const idx = state.reviewItems.findIndex((item) => item.id === row.id);
              if (idx >= 0) state.reviewItems[idx] = { ...state.reviewItems[idx], ...row };
              else state.reviewItems.push(row);
            }
            return { data: [], error: null };
          }
          return { data: [], error: null };
        },
      };
      return q;
    },
  };
}

describe("activateOnboardingHistory", () => {
  it("creates historical work order once and rerun does not duplicate", async () => {
    const sb = fakeSb();
    const first = await activateOnboardingHistory({ supabase: sb as any, shopId: "shop-1", sessionId: "session-1", actorId: "u1" });
    const second = await activateOnboardingHistory({ supabase: sb as any, shopId: "shop-1", sessionId: "session-1", actorId: "u1" });
    expect(first.historicalWorkOrdersCreated).toBe(1);
    expect(second.historicalWorkOrdersCreated).toBe(0);
    expect(sb.state.work_orders[0].status).toBe("completed");
  });

  it("creates review item for missing identifier", async () => {
    const sb = fakeSb();
    sb.state.entities = [{ id: "h-2", normalized: {} }] as any[];
    const result = await activateOnboardingHistory({ supabase: sb as any, shopId: "shop-1", sessionId: "session-1", actorId: "u1" });
    expect(result.needsReview).toBeGreaterThan(0);
    expect(sb.state.reviewItems.some((i) => i.issue_type === "missing_required_history_identifier")).toBe(true);
  });

  it("rerun is idempotent for missing_required_history_identifier", async () => {
    const sb = fakeSb();
    sb.state.entities = [{ id: "h-dup", normalized: {} }] as any[];
    await activateOnboardingHistory({ supabase: sb as any, shopId: "shop-1", sessionId: "session-1", actorId: "u1" });
    const before = sb.state.reviewItems.length;
    await activateOnboardingHistory({ supabase: sb as any, shopId: "shop-1", sessionId: "session-1", actorId: "u1" });
    expect(sb.state.reviewItems.length).toBe(before);
    expect(sb.state.reviewItems.filter((i: any) => i.issue_type === "missing_required_history_identifier")).toHaveLength(1);
  });

  it("rerun does not duplicate invalid_history_date review items", async () => {
    const sb = fakeSb();
    sb.state.entities = [{ id: "h-invalid-date", normalized: { sourceWorkOrderId: "RO-404", openedDate: "not-a-date" } }] as any[];
    await activateOnboardingHistory({ supabase: sb as any, shopId: "shop-1", sessionId: "session-1", actorId: "u1" });
    await activateOnboardingHistory({ supabase: sb as any, shopId: "shop-1", sessionId: "session-1", actorId: "u1" });
    expect(sb.state.reviewItems.filter((i: any) => i.issue_type === "invalid_history_date")).toHaveLength(1);
  });

});
