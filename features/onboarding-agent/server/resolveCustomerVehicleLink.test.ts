import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveCustomerVehicleLink } from "@/features/onboarding-agent/server/resolveCustomerVehicleLink";

vi.mock("@/features/onboarding-agent/server/assertOnboardingSessionOwnership", () => ({
  assertOnboardingSessionOwnership: vi.fn().mockResolvedValue(undefined),
}));

type ReviewItem = {
  id: string;
  shop_id: string;
  session_id: string;
  issue_type: string;
  link_id: string;
  status: string;
  summary: string;
  details: Record<string, unknown>;
  resolved_at?: string | null;
  resolved_by?: string | null;
};

type Customer = {
  id: string;
  shop_id: string | null;
  business_name: string | null;
  first_name: string | null;
  last_name: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  phone_number: string | null;
};

type Vehicle = {
  id: string;
  shop_id: string | null;
  customer_id: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  vin: string | null;
  license_plate: string | null;
  unit_number: string | null;
};

function createFakeSupabase(seed?: { reviewItems?: ReviewItem[]; customers?: Customer[]; vehicles?: Vehicle[] }) {
  const state = {
    reviewItems: [...(seed?.reviewItems ?? [])],
    customers: [...(seed?.customers ?? [])],
    vehicles: [...(seed?.vehicles ?? [])],
  };

  return {
    state,
    from(table: string) {
      const query: any = {
        table,
        op: "select",
        payload: null as any,
        filters: [] as Array<{ k: string; v: any; op: "eq" | "is" }>,
        select() { return this; },
        eq(k: string, v: any) { this.filters.push({ k, v, op: "eq" }); return this; },
        is(k: string, v: any) { this.filters.push({ k, v, op: "is" }); return this; },
        update(payload: any) { this.op = "update"; this.payload = payload; return this; },
        maybeSingle() { return this.execSingle(); },
        then(resolve: any, reject: any) { return this.exec().then(resolve, reject); },
        async execSingle() {
          const result = await this.exec();
          const first = Array.isArray(result.data) ? result.data[0] ?? null : result.data ?? null;
          return { ...result, data: first };
        },
        async exec() {
          const source = this.table === "onboarding_review_items"
            ? state.reviewItems
            : this.table === "customers"
              ? state.customers
              : this.table === "vehicles"
                ? state.vehicles
                : [];
          const filtered = source.filter((row: any) => this.filters.every((f: any) => {
            if (f.op === "eq") return row[f.k] === f.v;
            return f.v === null ? (row[f.k] === null || row[f.k] === undefined) : row[f.k] === f.v;
          }));

          if (this.op === "select") return { data: filtered, error: null };

          if (this.op === "update") {
            for (const row of filtered) Object.assign(row, this.payload);
            return { data: filtered, error: null };
          }

          return { data: [], error: null };
        },
      };
      return query;
    },
  };
}

function baseReviewItem(): ReviewItem {
  return {
    id: "review-1",
    shop_id: "shop-1",
    session_id: "session-1",
    issue_type: "unresolved_customer_vehicle_link",
    link_id: "link-1",
    status: "pending",
    summary: "pending",
    details: {
      liveVehicleId: "vehicle-1",
      proposedVehicleLabel: "2012 Ford Transit — VIN VIN123",
      candidateLiveCustomers: [{ id: "customer-1", name: "Target Customer" }],
    },
  };
}

describe("resolveCustomerVehicleLink", () => {
  let sb: ReturnType<typeof createFakeSupabase>;

  beforeEach(() => {
    sb = createFakeSupabase({
      reviewItems: [baseReviewItem()],
      customers: [
        { id: "customer-1", shop_id: "shop-1", business_name: null, first_name: null, last_name: null, name: "Target Customer", email: "target@example.com", phone: null, phone_number: null },
        { id: "customer-2", shop_id: "shop-2", business_name: null, first_name: null, last_name: null, name: "Other Shop", email: "other@example.com", phone: null, phone_number: null },
      ],
      vehicles: [
        { id: "vehicle-1", shop_id: "shop-1", customer_id: null, year: 2012, make: "Ford", model: "Transit", vin: "VIN123", license_plate: null, unit_number: null },
        { id: "vehicle-2", shop_id: "shop-2", customer_id: null, year: 2014, make: "Ford", model: "Transit", vin: "VIN222", license_plate: null, unit_number: null },
      ],
    });
  });

  it("links vehicle to selected customer", async () => {
    const result = await resolveCustomerVehicleLink({
      supabase: sb as any,
      shopId: "shop-1",
      sessionId: "session-1",
      actorId: "operator-1",
      reviewItemId: "review-1",
      action: "link",
      selectedCustomerId: "customer-1",
    });

    expect(result.ok).toBe(true);
    expect(sb.state.vehicles[0]?.customer_id).toBe("customer-1");
    expect(sb.state.reviewItems[0]?.status).toBe("resolved");
  });

  it("rejects cross-shop customer", async () => {
    await expect(resolveCustomerVehicleLink({
      supabase: sb as any,
      shopId: "shop-1",
      sessionId: "session-1",
      actorId: "operator-1",
      reviewItemId: "review-1",
      action: "link",
      selectedCustomerId: "customer-2",
    })).rejects.toThrow("Selected customer not found in shop");
  });

  it("rejects cross-shop vehicle/session via review lookup", async () => {
    await expect(resolveCustomerVehicleLink({
      supabase: sb as any,
      shopId: "shop-2",
      sessionId: "session-1",
      actorId: "operator-1",
      reviewItemId: "review-1",
      action: "link",
      selectedCustomerId: "customer-1",
    })).rejects.toThrow("Review item not found");
  });

  it("does not overwrite existing link to different customer", async () => {
    sb.state.vehicles[0]!.customer_id = "customer-other";

    await expect(resolveCustomerVehicleLink({
      supabase: sb as any,
      shopId: "shop-1",
      sessionId: "session-1",
      actorId: "operator-1",
      reviewItemId: "review-1",
      action: "link",
      selectedCustomerId: "customer-1",
    })).rejects.toThrow("replace is not supported");
  });

  it("skip action marks review item as skipped", async () => {
    const result = await resolveCustomerVehicleLink({
      supabase: sb as any,
      shopId: "shop-1",
      sessionId: "session-1",
      actorId: "operator-1",
      reviewItemId: "review-1",
      action: "skip",
    });

    expect(result.action).toBe("skip");
    expect(sb.state.reviewItems[0]?.status).toBe("skipped");
  });
});
