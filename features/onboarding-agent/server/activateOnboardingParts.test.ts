import { describe, expect, it, vi } from "vitest";
import { activateOnboardingParts } from "@/features/onboarding-agent/server/activateOnboardingParts";

vi.mock("@/features/onboarding-agent/server/assertOnboardingSessionOwnership", () => ({
  assertOnboardingSessionOwnership: vi.fn().mockResolvedValue(undefined),
}));

function fakeSb() {
  const state = {
    entities: [{ id: "part-1", normalized: { description: "Brake Pad", partNumber: "BP-1", quantityOnHandRaw: "5" }, display_name: "Brake Pad", source_external_id: "src-1" }] as any[],
    parts: [] as any[],
    suppliers: [{ id: "s1", name: "Vendor A" }],
    stock_locations: [{ id: "loc-1", shop_id: "shop-1" }],
    part_stock: [] as any[],
    stock_moves: [] as any[],
    reviewItems: [] as any[],
  };
  return {
    state,
    from(table: string) {
      const q: any = {
        table,
        op: "select",
        payload: null as any,
        select() { return this; },
        eq() { return this; },
        order() { return this; },
        limit() { return this; },
        insert(payload: any) { this.op = "insert"; this.payload = payload; return this; },
        update(payload: any) { this.op = "update"; this.payload = payload; return this; },
        upsert(payload: any) { this.op = "upsert"; this.payload = payload; return this.exec(); },
        single() { return this.execSingle(); },
        then(resolve: any, reject: any) { return this.exec().then(resolve, reject); },
        async execSingle() { const r = await this.exec(); return { ...r, data: Array.isArray(r.data) ? r.data[0] : r.data }; },
        async exec() {
          if (table === "onboarding_entities") return { data: state.entities, error: null };
          if (table === "parts" && this.op === "select") return { data: state.parts, error: null };
          if (table === "parts" && this.op === "insert") { const row = { ...this.payload, id: `p-${state.parts.length + 1}` }; state.parts.push(row); return { data: [row], error: null }; }
          if (table === "parts" && this.op === "update") return { data: [], error: null };
          if (table === "suppliers") return { data: state.suppliers, error: null };
          if (table === "stock_locations") return { data: state.stock_locations, error: null };
          if (table === "part_stock" && this.op === "select") return { data: state.part_stock, error: null };
          if (table === "part_stock" && this.op === "insert") { const row = { ...this.payload, id: `ps-${state.part_stock.length + 1}` }; state.part_stock.push(row); return { data: [row], error: null }; }
          if (table === "stock_moves") { state.stock_moves.push(this.payload); return { data: [], error: null }; }
          if (table === "onboarding_review_items") { state.reviewItems.push(...(Array.isArray(this.payload) ? this.payload : [this.payload])); return { data: [], error: null }; }
          return { data: [], error: null };
        },
      };
      return q;
    },
  };
}

describe("activateOnboardingParts", () => {
  it("creates part + stock once and rerun does not duplicate part", async () => {
    const sb = fakeSb();
    const first = await activateOnboardingParts({ supabase: sb as any, shopId: "shop-1", sessionId: "session-1", actorId: "u1" });
    const second = await activateOnboardingParts({ supabase: sb as any, shopId: "shop-1", sessionId: "session-1", actorId: "u1" });
    expect(first.partsCreated).toBe(1);
    expect(second.partsCreated).toBe(0);
    expect(sb.state.parts.length).toBe(1);
  });

  it("invalid quantity creates review item", async () => {
    const sb = fakeSb();
    sb.state.entities = [{ id: "part-2", normalized: { description: "Rotor", quantityOnHandRaw: "-5" }, display_name: "Rotor", source_external_id: null }] as any[];
    const result = await activateOnboardingParts({ supabase: sb as any, shopId: "shop-1", sessionId: "session-1", actorId: "u1" });
    expect(result.needsReview).toBeGreaterThan(0);
    expect(sb.state.reviewItems.some((i) => i.issue_type === "invalid_quantity")).toBe(true);
  });
});
