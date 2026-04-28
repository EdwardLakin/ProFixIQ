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
    entities: [
      { id: "h-1", shop_id: "shop-1", session_id: "session-1", entity_type: "historical_work_order", status: "ready", normalized: { sourceWorkOrderId: "RO-1", openedDate: "2022-01-01", customerName: "Acme", vehicleVin: "VIN1", complaint: "Noise" } },
      { id: "c-stage-1", shop_id: "shop-1", session_id: "session-1", entity_type: "customer", status: "ready", source_external_id: "CUST-1", display_name: "Acme", normalized: { sourceCustomerId: "CUST-1", name: "Acme" } },
      { id: "v-stage-1", shop_id: "shop-1", session_id: "session-1", entity_type: "vehicle", status: "ready", source_external_id: "VEH-1", normalized: { sourceVehicleId: "VEH-1", vin: "VIN1" } },
    ] as any[],
    links: [
      { id: "l-c-1", shop_id: "shop-1", session_id: "session-1", link_type: "customer_work_order", from_entity_id: "c-stage-1", to_entity_id: "h-1" },
      { id: "l-v-1", shop_id: "shop-1", session_id: "session-1", link_type: "vehicle_work_order", from_entity_id: "v-stage-1", to_entity_id: "h-1" },
    ] as any[],
    customers: [{ id: "c-1", shop_id: "shop-1", external_id: "CUST-1", email: null, name: "Acme", business_name: null }],
    vehicles: [{ id: "v-1", shop_id: "shop-1", external_id: "VEH-1", vin: "VIN1", license_plate: null }],
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
        rangeFrom: 0,
        rangeTo: Number.MAX_SAFE_INTEGER,
        select() { return this; },
        eq(key: string, value: any) { this.filters.push({ key, value }); return this; },
        in() { return this; },
        order() { return this; },
        range(from: number, to: number) { this.rangeFrom = from; this.rangeTo = to; return this; },
        insert(payload: any) { this.op = "insert"; this.payload = payload; return this; },
        update(payload: any) { this.op = "update"; this.payload = payload; return this; },
        upsert(payload: any) { this.op = "upsert"; this.payload = payload; return this.exec(); },
        single() { return this.execSingle(); },
        then(resolve: any, reject: any) { return this.exec().then(resolve, reject); },
        async execSingle() { const r = await this.exec(); return { ...r, data: Array.isArray(r.data) ? r.data[0] : r.data }; },
        async exec() {
          const applyFilters = (rows: any[]) => rows
            .filter((row) => this.filters.every((f: any) => row?.[f.key] === f.value))
            .slice(this.rangeFrom, this.rangeTo + 1);
          if (table === "onboarding_entities") return { data: applyFilters(state.entities), error: null };
          if (table === "onboarding_entity_links") return { data: applyFilters(state.links), error: null };
          if (table === "customers") return { data: applyFilters(state.customers), error: null };
          if (table === "vehicles") return { data: applyFilters(state.vehicles), error: null };
          if (table === "work_orders" && this.op === "select") return { data: applyFilters(state.work_orders), error: null };
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

  it("resolves customer_work_order and vehicle_work_order links in either direction", async () => {
    const sb = fakeSb();
    sb.state.links = [
      { id: "l-c-1", shop_id: "shop-1", session_id: "session-1", link_type: "customer_work_order", from_entity_id: "h-1", to_entity_id: "c-stage-1" },
      { id: "l-v-1", shop_id: "shop-1", session_id: "session-1", link_type: "vehicle_work_order", from_entity_id: "v-stage-1", to_entity_id: "h-1" },
    ];
    const result = await activateOnboardingHistory({ supabase: sb as any, shopId: "shop-1", sessionId: "session-1", actorId: "u1" });
    expect(result.historicalWorkOrdersCreated).toBe(1);
    expect(sb.state.work_orders[0].customer_id).toBe("c-1");
    expect(sb.state.work_orders[0].vehicle_id).toBe("v-1");
  });

  it("resolves links when staged customer/vehicle entities are not ready", async () => {
    const sb = fakeSb();
    sb.state.entities = [
      { id: "h-1", shop_id: "shop-1", session_id: "session-1", entity_type: "historical_work_order", status: "ready", normalized: { sourceWorkOrderId: "RO-1", openedDate: "2022-01-01" } },
      { id: "c-stage-1", shop_id: "shop-1", session_id: "session-1", entity_type: "customer", status: "activated", source_external_id: "CUST-1", display_name: "Acme", normalized: { sourceCustomerId: "CUST-1", name: "Acme" } },
      { id: "v-stage-1", shop_id: "shop-1", session_id: "session-1", entity_type: "vehicle", status: "activated", source_external_id: "VEH-1", normalized: { sourceVehicleId: "VEH-1", vin: "VIN1" } },
    ] as any[];
    const result = await activateOnboardingHistory({ supabase: sb as any, shopId: "shop-1", sessionId: "session-1", actorId: "u1" });
    expect(result.historicalWorkOrdersCreated).toBe(1);
    expect(result.resolvedViaCustomerWorkOrderLink).toBe(1);
    expect(result.resolvedViaVehicleWorkOrderLink).toBe(1);
  });

  it("resolves live vehicle from staged unit number mapping used by customer/vehicle activation", async () => {
    const sb = fakeSb();
    sb.state.entities = [
      { id: "h-1", shop_id: "shop-1", session_id: "session-1", entity_type: "historical_work_order", status: "ready", normalized: { sourceWorkOrderId: "RO-1", openedDate: "2022-01-01" } },
      { id: "c-stage-1", shop_id: "shop-1", session_id: "session-1", entity_type: "customer", status: "activated", source_external_id: "CUST-1", display_name: "Acme", normalized: { sourceCustomerId: "CUST-1", name: "Acme" } },
      { id: "v-stage-1", shop_id: "shop-1", session_id: "session-1", entity_type: "vehicle", status: "activated", source_external_id: null, normalized: { unitNumber: "TRUCK-42", make: "Ford", model: "F-150", year: "2021" } },
    ] as any[];
    sb.state.links = [
      { id: "l-c-1", shop_id: "shop-1", session_id: "session-1", link_type: "customer_work_order", from_entity_id: "c-stage-1", to_entity_id: "h-1" },
      { id: "l-v-1", shop_id: "shop-1", session_id: "session-1", link_type: "vehicle_work_order", from_entity_id: "v-stage-1", to_entity_id: "h-1" },
    ] as any[];
    sb.state.vehicles = [{ id: "v-42", shop_id: "shop-1", external_id: null, vin: null, license_plate: null, unit_number: "TRUCK-42", year: 2021, make: "Ford", model: "F-150" }] as any[];

    const result = await activateOnboardingHistory({ supabase: sb as any, shopId: "shop-1", sessionId: "session-1", actorId: "u1" });
    expect(result.historicalWorkOrdersCreated).toBe(1);
    expect(result.diagnostics.rowsWithBothLiveCustomerAndVehicle).toBe(1);
  });

  it("creates review item for missing identifier", async () => {
    const sb = fakeSb();
    sb.state.entities = [{ id: "h-2", shop_id: "shop-1", session_id: "session-1", entity_type: "historical_work_order", status: "ready", normalized: {} }] as any[];
    const result = await activateOnboardingHistory({ supabase: sb as any, shopId: "shop-1", sessionId: "session-1", actorId: "u1" });
    expect(result.needsReview).toBeGreaterThan(0);
    expect(sb.state.reviewItems.some((i) => i.issue_type === "missing_required_history_identifier")).toBe(true);
  });

  it("rerun is idempotent for missing_required_history_identifier", async () => {
    const sb = fakeSb();
    sb.state.entities = [{ id: "h-dup", shop_id: "shop-1", session_id: "session-1", entity_type: "historical_work_order", status: "ready", normalized: {} }] as any[];
    await activateOnboardingHistory({ supabase: sb as any, shopId: "shop-1", sessionId: "session-1", actorId: "u1" });
    const before = sb.state.reviewItems.length;
    await activateOnboardingHistory({ supabase: sb as any, shopId: "shop-1", sessionId: "session-1", actorId: "u1" });
    expect(sb.state.reviewItems.length).toBe(before);
    expect(sb.state.reviewItems.filter((i: any) => i.issue_type === "missing_required_history_identifier")).toHaveLength(1);
  });

  it("rerun does not duplicate invalid_history_date review items", async () => {
    const sb = fakeSb();
    sb.state.entities = [{ id: "h-invalid-date", shop_id: "shop-1", session_id: "session-1", entity_type: "historical_work_order", status: "ready", normalized: { sourceWorkOrderId: "RO-404", openedDate: "not-a-date" } }] as any[];
    await activateOnboardingHistory({ supabase: sb as any, shopId: "shop-1", sessionId: "session-1", actorId: "u1" });
    await activateOnboardingHistory({ supabase: sb as any, shopId: "shop-1", sessionId: "session-1", actorId: "u1" });
    expect(sb.state.reviewItems.filter((i: any) => i.issue_type === "invalid_history_date")).toHaveLength(1);
  });

  it("paginates staged history rows over 1000 and keeps historical queue behavior", async () => {
    const sb = fakeSb();
    sb.state.entities = (Array.from({ length: 6076 }, (_, index) => ({
      id: `h-${index + 1}`,
      shop_id: "shop-1",
      session_id: "session-1",
      entity_type: "historical_work_order",
      status: "ready",
      normalized: index === 6075
        ? { sourceWorkOrderId: `RO-${index + 1}`, openedDate: "2022-01-01", customerName: "Acme", vehicleVin: "VIN1", complaint: "Noise" }
        : { sourceWorkOrderId: `RO-${index + 1}` },
    })) as any[]).concat([
      { id: "c-stage-1", shop_id: "shop-1", session_id: "session-1", entity_type: "customer", status: "ready", source_external_id: "CUST-1", display_name: "Acme", normalized: { sourceCustomerId: "CUST-1", name: "Acme" } },
      { id: "v-stage-1", shop_id: "shop-1", session_id: "session-1", entity_type: "vehicle", status: "ready", source_external_id: "VEH-1", normalized: { sourceVehicleId: "VEH-1", vin: "VIN1" } },
    ]);
    sb.state.links = [
      { id: "l-c-1", shop_id: "shop-1", session_id: "session-1", link_type: "customer_work_order", from_entity_id: "c-stage-1", to_entity_id: "h-6076" },
      { id: "l-v-1", shop_id: "shop-1", session_id: "session-1", link_type: "vehicle_work_order", from_entity_id: "v-stage-1", to_entity_id: "h-6076" },
    ];

    const first = await activateOnboardingHistory({ supabase: sb as any, shopId: "shop-1", sessionId: "session-1", actorId: "u1" });
    const second = await activateOnboardingHistory({ supabase: sb as any, shopId: "shop-1", sessionId: "session-1", actorId: "u1" });

    expect(first.stagedHistoryRows).toBe(6076);
    expect(first.historicalWorkOrdersCreated).toBe(1);
    expect(first.skipped).toBeGreaterThan(0);
    expect(first.reviewItemsCreated).toBeGreaterThan(0);
    expect(sb.state.work_orders.some((row) => row.custom_id === "RO-6076")).toBe(true);
    expect(sb.state.work_orders.every((row) => row.type === "historical_import" && row.status === "completed")).toBe(true);
    expect(second.historicalWorkOrdersCreated).toBe(0);
    expect(second.reviewItemsCreated).toBe(0);
    expect(second.reviewItemsReused).toBeGreaterThan(0);
  });

  it("skips unresolved mapping rows and does not create orphan work orders", async () => {
    const sb = fakeSb();
    sb.state.links = [];
    sb.state.entities = [
      { id: "h-1", shop_id: "shop-1", session_id: "session-1", entity_type: "historical_work_order", status: "ready", normalized: { sourceWorkOrderId: "RO-1", openedDate: "2022-01-01" } },
      { id: "c-stage-1", shop_id: "shop-1", session_id: "session-1", entity_type: "customer", status: "ready", source_external_id: "CUST-1", display_name: "Acme", normalized: { sourceCustomerId: "CUST-1", name: "Acme" } },
      { id: "v-stage-1", shop_id: "shop-1", session_id: "session-1", entity_type: "vehicle", status: "ready", source_external_id: "VEH-1", normalized: { sourceVehicleId: "VEH-1", vin: "VIN1" } },
    ] as any[];
    const result = await activateOnboardingHistory({ supabase: sb as any, shopId: "shop-1", sessionId: "session-1", actorId: "u1" });
    expect(result.historicalWorkOrdersCreated).toBe(0);
    expect(result.skippedUnresolved).toBe(1);
    expect(result.skippedMissingCustomer).toBe(1);
    expect(result.skippedMissingVehicle).toBe(1);
    expect(result.diagnostics.unresolvedSamples[0]?.finalSkipReason).toBe("missing_vehicle_link");
    expect(sb.state.work_orders).toHaveLength(0);
  });

  it("activates resolvable history rows and skips only unresolved row", async () => {
    const sb = fakeSb();
    sb.state.entities = [
      ...Array.from({ length: 6 }, (_, idx) => ({
        id: `h-${idx + 1}`,
        shop_id: "shop-1",
        session_id: "session-1",
        entity_type: "historical_work_order",
        status: "ready",
        normalized: {
          sourceWorkOrderId: `RO-${idx + 1}`,
          openedDate: "2022-01-01",
          customerName: idx === 5 ? "Missing Co" : "Acme",
          sourceCustomerId: idx === 5 ? "CUST-MISSING" : "CUST-1",
          sourceVehicleId: idx === 5 ? "VEH-MISSING" : "VEH-1",
          vehicleVin: idx === 5 ? "VIN-MISSING" : "VIN1",
        },
      })),
      { id: "c-stage-1", shop_id: "shop-1", session_id: "session-1", entity_type: "customer", status: "ready", source_external_id: "CUST-1", display_name: "Acme", normalized: { sourceCustomerId: "CUST-1", name: "Acme" } },
      { id: "c-stage-missing", shop_id: "shop-1", session_id: "session-1", entity_type: "customer", status: "ready", source_external_id: "CUST-MISSING", display_name: "Missing", normalized: { sourceCustomerId: "CUST-MISSING", name: "Missing" } },
      { id: "v-stage-1", shop_id: "shop-1", session_id: "session-1", entity_type: "vehicle", status: "ready", source_external_id: "VEH-1", normalized: { sourceVehicleId: "VEH-1", vin: "VIN1" } },
      { id: "v-stage-missing", shop_id: "shop-1", session_id: "session-1", entity_type: "vehicle", status: "ready", source_external_id: "VEH-MISSING", normalized: { sourceVehicleId: "VEH-MISSING", vin: "VIN-MISSING" } },
    ] as any[];
    sb.state.links = [
      ...Array.from({ length: 6 }, (_, idx) => ({
        id: `l-c-${idx + 1}`,
        shop_id: "shop-1",
        session_id: "session-1",
        link_type: "customer_work_order",
        from_entity_id: idx === 5 ? `h-${idx + 1}` : "c-stage-1",
        to_entity_id: idx === 5 ? "c-stage-missing" : `h-${idx + 1}`,
      })),
      ...Array.from({ length: 6 }, (_, idx) => ({
        id: `l-v-${idx + 1}`,
        shop_id: "shop-1",
        session_id: "session-1",
        link_type: "vehicle_work_order",
        from_entity_id: idx === 5 ? "v-stage-missing" : "v-stage-1",
        to_entity_id: `h-${idx + 1}`,
      })),
    ] as any[];

    const first = await activateOnboardingHistory({ supabase: sb as any, shopId: "shop-1", sessionId: "session-1", actorId: "u1" });
    const second = await activateOnboardingHistory({ supabase: sb as any, shopId: "shop-1", sessionId: "session-1", actorId: "u1" });

    expect(first.stagedHistoryRows).toBe(6);
    expect(first.historicalWorkOrdersCreated + first.existingMatched).toBe(5);
    expect(first.skippedUnresolved).toBe(1);
    expect(first.diagnostics.rowsWithBothLiveCustomerAndVehicle).toBe(5);
    expect(first.unresolvedDueToMissingLiveCustomer).toBe(1);
    expect(first.unresolvedDueToMissingLiveVehicle).toBe(1);
    expect(first.customerWorkOrderLinks).toBe(6);
    expect(first.vehicleWorkOrderLinks).toBe(6);
    expect(sb.state.work_orders).toHaveLength(5);
    expect(sb.state.work_orders.every((row: any) => row.type === "historical_import" && row.status === "completed")).toBe(true);
    expect(second.historicalWorkOrdersCreated).toBe(0);
    expect(second.existingMatched).toBe(5);
    expect(sb.state.work_orders).toHaveLength(5);
  });

  it("mixed large dataset does not blanket-skip when links resolve", async () => {
    const sb = fakeSb();
    const rows = 200;
    sb.state.entities = [
      ...Array.from({ length: rows }, (_, idx) => ({
        id: `h-${idx + 1}`,
        shop_id: "shop-1",
        session_id: "session-1",
        entity_type: "historical_work_order",
        status: "ready",
        normalized: { sourceWorkOrderId: `RO-${idx + 1}`, openedDate: "2022-01-01" },
      })),
      { id: "c-stage-1", shop_id: "shop-1", session_id: "session-1", entity_type: "customer", status: "activated", source_external_id: "CUST-1", display_name: "Acme", normalized: { sourceCustomerId: "CUST-1", name: "Acme" } },
      { id: "v-stage-1", shop_id: "shop-1", session_id: "session-1", entity_type: "vehicle", status: "activated", source_external_id: "VEH-1", normalized: { sourceVehicleId: "VEH-1", vin: "VIN1" } },
      { id: "h-missing", shop_id: "shop-1", session_id: "session-1", entity_type: "historical_work_order", status: "ready", normalized: { sourceWorkOrderId: "RO-missing", openedDate: "2022-01-01" } },
    ] as any[];
    sb.state.links = [
      ...Array.from({ length: rows }, (_, idx) => ({ id: `l-c-${idx + 1}`, shop_id: "shop-1", session_id: "session-1", link_type: "customer_work_order", from_entity_id: "c-stage-1", to_entity_id: `h-${idx + 1}` })),
      ...Array.from({ length: rows }, (_, idx) => ({ id: `l-v-${idx + 1}`, shop_id: "shop-1", session_id: "session-1", link_type: "vehicle_work_order", from_entity_id: "v-stage-1", to_entity_id: `h-${idx + 1}` })),
    ] as any[];

    const result = await activateOnboardingHistory({ supabase: sb as any, shopId: "shop-1", sessionId: "session-1", actorId: "u1" });
    expect(result.historicalWorkOrdersCreated).toBe(rows);
    expect(result.skippedUnresolved).toBe(1);
    expect(result.diagnostics.rowsWithBothLiveCustomerAndVehicle).toBe(rows);
  });

  it("rerun matches existing historical import and does not create duplicates", async () => {
    const sb = fakeSb();
    sb.state.work_orders.push({
      id: "wo-existing",
      shop_id: "shop-1",
      custom_id: "RO-1",
      source_row_id: "not-used",
      type: "historical_import",
      status: "completed",
    });
    const result = await activateOnboardingHistory({ supabase: sb as any, shopId: "shop-1", sessionId: "session-1", actorId: "u1" });
    expect(result.existingMatched).toBe(1);
    expect(result.historicalWorkOrdersCreated).toBe(0);
  });

});
