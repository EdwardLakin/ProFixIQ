import { describe, expect, it, vi } from "vitest";
import { stableUuidFromParts } from "@/features/onboarding-agent/lib/staging";
import { activateOnboardingParts } from "@/features/onboarding-agent/server/activateOnboardingParts";

vi.mock("@/features/onboarding-agent/server/assertOnboardingSessionOwnership", () => ({
  assertOnboardingSessionOwnership: vi.fn().mockResolvedValue(undefined),
}));

type Op = "eq" | "in";

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
    entities: [
      {
        id: "part-1",
        shop_id: "shop-1",
        session_id: "session-1",
        entity_type: "part",
        status: "ready",
        normalized: { description: "Brake Pad", partNumber: "BP-1", quantityOnHandRaw: "5" },
        display_name: "Brake Pad",
        source_external_id: "src-1",
      },
    ] as any[],
    parts: [] as any[],
    suppliers: [{ id: "s1", name: "Vendor A", shop_id: "shop-1" }],
    stock_locations: [{ id: "loc-1", shop_id: "shop-1" }],
    part_stock: [] as any[],
    stock_moves: [] as any[],
    reviewItems: [] as any[],
  };

  return {
    state,
    from(table: string) {
      const filters: Array<{ op: Op; col: string; value: any }> = [];
      const q: any = {
        table,
        op: "select",
        payload: null as any,
        options: null as any,
        rangeFrom: 0,
        rangeTo: Number.MAX_SAFE_INTEGER,
        select() { return this; },
        eq(col: string, value: any) { filters.push({ op: "eq", col, value }); return this; },
        in(col: string, value: any[]) { filters.push({ op: "in", col, value }); return this; },
        range(from: number, to: number) { this.rangeFrom = from; this.rangeTo = to; return this; },
        order(col: string) {
          if (table === "stock_locations" && col === "created_at") throw new Error("stock_locations.created_at should not be queried");
          return this;
        },
        limit() { return this; },
        insert(payload: any) { this.op = "insert"; this.payload = payload; return this; },
        update(payload: any) { this.op = "update"; this.payload = payload; return this; },
        upsert(payload: any, options?: any) { this.op = "upsert"; this.payload = payload; this.options = options; return this.exec(); },
        single() { return this.execSingle(); },
        then(resolve: any, reject: any) { return this.exec().then(resolve, reject); },
        async execSingle() { const r = await this.exec(); return { ...r, data: Array.isArray(r.data) ? r.data[0] : r.data }; },
        async exec() {
          const applyFilters = (rows: any[]) => rows
            .filter((row) => filters.every((f) => (f.op === "eq" ? row?.[f.col] === f.value : (f.value ?? []).includes(row?.[f.col]))))
            .slice(this.rangeFrom, this.rangeTo + 1);

          if (table === "onboarding_entities") return { data: applyFilters(state.entities), error: null };
          if (table === "parts" && this.op === "select") return { data: applyFilters(state.parts), error: null };
          if (table === "parts" && this.op === "insert") {
            const row = { ...this.payload, id: `p-${state.parts.length + 1}` };
            state.parts.push(row);
            return { data: [row], error: null };
          }
          if (table === "parts" && this.op === "update") return { data: [], error: null };
          if (table === "suppliers") return { data: applyFilters(state.suppliers), error: null };
          if (table === "stock_locations") return { data: applyFilters(state.stock_locations), error: null };
          if (table === "part_stock" && this.op === "select") return { data: applyFilters(state.part_stock), error: null };
          if (table === "part_stock" && this.op === "insert") {
            const row = { ...this.payload, id: `ps-${state.part_stock.length + 1}` };
            state.part_stock.push(row);
            return { data: [row], error: null };
          }
          if (table === "stock_moves") {
            if (this.op === "upsert" && this.options?.onConflict === "id") {
              const row = this.payload;
              const i = state.stock_moves.findIndex((m) => m.id === row.id);
              if (i >= 0) state.stock_moves[i] = { ...state.stock_moves[i], ...row };
              else state.stock_moves.push(row);
            }
            return { data: [], error: null };
          }
          if (table === "onboarding_review_items" && this.op === "select") return { data: [...state.reviewItems], error: null };
          if (table === "onboarding_review_items" && this.op === "insert") {
            const row = this.payload;
            const existing = state.reviewItems.find((item) => reviewScopeKey(item) === reviewScopeKey(row));
            if (existing) return { data: null, error: { code: "23505", message: 'duplicate key value violates unique constraint "onboarding_review_items_shop_session_issue_scope_uidx"' } };
            state.reviewItems.push(row);
            return { data: [row], error: null };
          }
          if (table === "onboarding_review_items" && this.op === "update") {
            const target = state.reviewItems.find((item) => filters.every((f) => (f.op === "eq" ? item?.[f.col] === f.value : (f.value ?? []).includes(item?.[f.col]))));
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

describe("activateOnboardingParts", () => {
  it("creates deterministic stock seed move once and rerun does not duplicate", async () => {
    const sb = fakeSb();

    const first = await activateOnboardingParts({ supabase: sb as any, shopId: "shop-1", sessionId: "session-1", actorId: "u1" });
    const second = await activateOnboardingParts({ supabase: sb as any, shopId: "shop-1", sessionId: "session-1", actorId: "u1" });

    const expectedMoveId = stableUuidFromParts(["shop-1", "session-1", "part-1", "stock-seed"]);
    expect(first.partsCreated).toBe(1);
    expect(second.partsCreated).toBe(0);
    expect(sb.state.parts.length).toBe(1);
    expect(sb.state.stock_moves).toHaveLength(1);
    expect(sb.state.stock_moves[0]).toMatchObject({
      id: expectedMoveId,
      shop_id: "shop-1",
      reference_id: "part-1",
      reference_kind: "onboarding_parts_seed",
      reason: "seed",
    });
  });

  it("stock move id is stable for same shop/session/source row/part/location tuple", async () => {
    const a = stableUuidFromParts(["shop-1", "session-1", "part-1", "stock-seed"]);
    const b = stableUuidFromParts(["shop-1", "session-1", "part-1", "stock-seed"]);
    expect(a).toBe(b);
  });

  it("writes stock_moves only for active shop/session entities and skips invalid rows", async () => {
    const sb = fakeSb();
    sb.state.entities = [
      {
        id: "part-valid",
        shop_id: "shop-1",
        session_id: "session-1",
        entity_type: "part",
        status: "ready",
        normalized: { description: "Rotor", quantityOnHandRaw: "3" },
        display_name: "Rotor",
        source_external_id: null,
      },
      {
        id: "part-invalid",
        shop_id: "shop-1",
        session_id: "session-1",
        entity_type: "part",
        status: "ready",
        normalized: { description: "Bad Qty", quantityOnHandRaw: "-2" },
        display_name: "Bad Qty",
        source_external_id: null,
      },
      {
        id: "part-other-session",
        shop_id: "shop-1",
        session_id: "session-2",
        entity_type: "part",
        status: "ready",
        normalized: { description: "Other Session", quantityOnHandRaw: "4" },
        display_name: "Other Session",
        source_external_id: null,
      },
      {
        id: "part-other-shop",
        shop_id: "shop-2",
        session_id: "session-1",
        entity_type: "part",
        status: "ready",
        normalized: { description: "Other Shop", quantityOnHandRaw: "4" },
        display_name: "Other Shop",
        source_external_id: null,
      },
    ];

    await activateOnboardingParts({ supabase: sb as any, shopId: "shop-1", sessionId: "session-1", actorId: "u1" });

    expect(sb.state.stock_moves).toHaveLength(1);
    expect(sb.state.stock_moves[0]?.reference_id).toBe("part-valid");
    expect(sb.state.stock_moves[0]?.shop_id).toBe("shop-1");
    expect(sb.state.reviewItems.some((i) => i.issue_type === "invalid_quantity" && i.entity_id === "part-invalid")).toBe(true);
    expect(sb.state.stock_moves.some((m) => m.reference_id === "part-other-session" || m.reference_id === "part-other-shop")).toBe(false);
  });
  it("rerun reuses existing pending review item without duplicates", async () => {
    const sb = fakeSb();
    sb.state.entities = [{
      id: "part-issue",
      shop_id: "shop-1",
      session_id: "session-1",
      entity_type: "part",
      status: "ready",
      normalized: { description: "Bad Qty", quantityOnHandRaw: "-1" },
      display_name: "Bad Qty",
      source_external_id: null,
    }];

    await activateOnboardingParts({ supabase: sb as any, shopId: "shop-1", sessionId: "session-1", actorId: "u1" });
    const before = sb.state.reviewItems.length;
    await activateOnboardingParts({ supabase: sb as any, shopId: "shop-1", sessionId: "session-1", actorId: "u1" });
    expect(sb.state.reviewItems.length).toBe(before);
    expect(sb.state.reviewItems.filter((i) => i.issue_type === "invalid_quantity")).toHaveLength(1);
  });

  it("rerun does not duplicate ambiguous_vendor_for_part review items", async () => {
    const sb = fakeSb();
    sb.state.entities = [{
      id: "part-ambiguous-vendor",
      shop_id: "shop-1",
      session_id: "session-1",
      entity_type: "part",
      status: "ready",
      normalized: { description: "Pad", vendorName: "Missing Vendor" },
      display_name: "Pad",
      source_external_id: null,
    }];

    await activateOnboardingParts({ supabase: sb as any, shopId: "shop-1", sessionId: "session-1", actorId: "u1" });
    await activateOnboardingParts({ supabase: sb as any, shopId: "shop-1", sessionId: "session-1", actorId: "u1" });
    expect(sb.state.reviewItems.filter((i: any) => i.issue_type === "ambiguous_vendor_for_part")).toHaveLength(1);
  });

  it("paginates staged parts over 1000 rows and preserves idempotency across reruns", async () => {
    const sb = fakeSb();
    sb.state.entities = Array.from({ length: 3200 }, (_, index) => ({
      id: `part-${index + 1}`,
      shop_id: "shop-1",
      session_id: "session-1",
      entity_type: "part",
      status: "ready",
      normalized: {
        description: index === 3199 ? "Part 3200" : "",
        quantityOnHandRaw: index === 1500 ? "-1" : "1",
      },
      display_name: `Part ${index + 1}`,
      source_external_id: `src-${index + 1}`,
    }));

    const first = await activateOnboardingParts({ supabase: sb as any, shopId: "shop-1", sessionId: "session-1", actorId: "u1" });
    const second = await activateOnboardingParts({ supabase: sb as any, shopId: "shop-1", sessionId: "session-1", actorId: "u1" });

    expect(first.stagedParts).toBe(3200);
    expect(first.partsCreated).toBe(1);
    expect(sb.state.parts.some((row) => row.source_intake_id === "session-1" && row.name === "Part 3200")).toBe(true);
    expect(first.skipped).toBeGreaterThan(0);
    expect(first.reviewItemsCreated).toBeGreaterThan(0);
    expect(second.partsCreated).toBe(0);
    expect(second.reviewItemsCreated).toBe(0);
    expect(second.reviewItemsReused).toBeGreaterThan(0);
    expect(second.reviewItemsPersisted).toBeGreaterThan(0);
  });

});
