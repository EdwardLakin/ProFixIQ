import { beforeEach, describe, expect, it, vi } from "vitest";
import { activateOnboardingCustomersVehicles } from "@/features/onboarding-agent/server/activateOnboardingCustomersVehicles";

vi.mock("@/features/onboarding-agent/server/assertOnboardingSessionOwnership", () => ({
  assertOnboardingSessionOwnership: vi.fn().mockResolvedValue(undefined),
}));

type ActivationParams = Parameters<typeof activateOnboardingCustomersVehicles>[0];
type Entity = {
  id: string;
  shop_id: string;
  session_id: string;
  entity_type: string;
  status: string;
  display_name: string | null;
  normalized: Record<string, unknown>;
  source_external_id: string | null;
};

type Link = {
  id: string;
  shop_id: string;
  session_id: string;
  from_entity_id: string;
  to_entity_id: string;
  link_type: string;
};

type Customer = {
  id: string;
  shop_id: string | null;
  external_id: string | null;
  email: string | null;
  phone: string | null;
  phone_number: string | null;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
  business_name: string | null;
};

type Vehicle = {
  id: string;
  shop_id: string | null;
  external_id: string | null;
  vin: string | null;
  license_plate: string | null;
  unit_number: string | null;
  year: number | null;
  make: string | null;
  model: string | null;
  customer_id: string | null;
};

function createFakeSupabase(seed?: {
  entities?: Entity[];
  links?: Link[];
  customers?: Customer[];
  vehicles?: Vehicle[];
}) {
  const state = {
    entities: [...(seed?.entities ?? [])],
    links: [...(seed?.links ?? [])],
    customers: [...(seed?.customers ?? [])],
    vehicles: [...(seed?.vehicles ?? [])],
    nextCustomerId: 1,
    nextVehicleId: 1,
    writes: [] as string[],
  };

  return {
    state,
    from(table: string) {
      const query: any = {
        table,
        op: "select",
        payload: null as any,
        filters: [] as Array<{ k: string; v: any; op: "eq" | "in" }>,
        selectOpts: null as any,
        select(_columns: string, options?: any) {
          this.selectOpts = options ?? null;
          if (!this.op) this.op = "select";
          return this;
        },
        order() { return this; },
        eq(k: string, v: any) { this.filters.push({ k, v, op: "eq" }); return this; },
        in(k: string, v: any[]) { this.filters.push({ k, v, op: "in" }); return this; },
        update(payload: any) { this.op = "update"; this.payload = payload; return this; },
        insert(payload: any) { this.op = "insert"; this.payload = payload; return this; },
        single() { return this.execSingle(); },
        then(resolve: any, reject: any) { return this.exec().then(resolve, reject); },
        async execSingle() {
          const result = await this.exec();
          const first = Array.isArray(result.data) ? result.data[0] ?? null : result.data ?? null;
          return { ...result, data: first };
        },
        async exec() {
          const applyFilters = (rows: any[]) => {
            let filtered = [...rows];
            for (const filter of this.filters) {
              filtered = filtered.filter((row) => {
                if (filter.op === "eq") return row[filter.k] === filter.v;
                return Array.isArray(filter.v) && filter.v.includes(row[filter.k]);
              });
            }
            return filtered;
          };

          if (this.table === "onboarding_entities" && this.op === "select") return { data: applyFilters(state.entities), error: null };
          if (this.table === "onboarding_entity_links" && this.op === "select") return { data: applyFilters(state.links), error: null };

          if (this.table === "customers" && this.op === "select") {
            const rows = applyFilters(state.customers);
            if (this.selectOpts?.head) return { data: null, count: rows.length, error: null };
            return { data: rows, error: null };
          }

          if (this.table === "vehicles" && this.op === "select") {
            const rows = applyFilters(state.vehicles);
            if (this.selectOpts?.head) return { data: null, count: rows.length, error: null };
            return { data: rows, error: null };
          }

          if (this.table === "customers" && this.op === "insert") {
            const created = { id: `customer-${state.nextCustomerId++}`, ...this.payload };
            state.customers.push(created);
            state.writes.push("customers:insert");
            return { data: [{ id: created.id }], error: null };
          }

          if (this.table === "customers" && this.op === "update") {
            const target = applyFilters(state.customers)[0];
            if (target) Object.assign(target, this.payload);
            state.writes.push("customers:update");
            return { data: [], error: null };
          }

          if (this.table === "vehicles" && this.op === "insert") {
            const created = { id: `vehicle-${state.nextVehicleId++}`, ...this.payload };
            state.vehicles.push(created);
            state.writes.push("vehicles:insert");
            return { data: [{ id: created.id }], error: null };
          }

          if (this.table === "vehicles" && this.op === "update") {
            const target = applyFilters(state.vehicles)[0];
            if (target) Object.assign(target, this.payload);
            state.writes.push("vehicles:update");
            return { data: [], error: null };
          }

          return { data: [], error: null };
        },
      };

      return query;
    },
  };
}

function stagedCustomer(id: string, overrides?: Partial<Entity>): Entity {
  return {
    id,
    shop_id: "shop-1",
    session_id: "session-1",
    entity_type: "customer",
    status: "ready",
    display_name: "Jane Doe",
    normalized: { sourceCustomerId: `C-${id}`, name: "Jane Doe", email: `jane${id}@example.com`, phone: "555-111-2222" },
    source_external_id: `C-${id}`,
    ...overrides,
  };
}

function stagedVehicle(id: string, overrides?: Partial<Entity>): Entity {
  return {
    id,
    shop_id: "shop-1",
    session_id: "session-1",
    entity_type: "vehicle",
    status: "ready",
    display_name: "2020 Ford F150",
    normalized: { sourceVehicleId: `V-${id}`, sourceCustomerId: "C-c1", vin: `VIN${id}`, plate: `ABC${id}`, year: "2020", make: "Ford", model: "F150" },
    source_external_id: `V-${id}`,
    ...overrides,
  };
}

async function runActivation(sb: ReturnType<typeof createFakeSupabase>, overrides?: Partial<ActivationParams>) {
  return activateOnboardingCustomersVehicles({
    supabase: sb as any,
    shopId: "shop-1",
    sessionId: "session-1",
    ...overrides,
  });
}

describe("activateOnboardingCustomersVehicles", () => {
  let sb: ReturnType<typeof createFakeSupabase>;

  beforeEach(() => {
    sb = createFakeSupabase();
  });

  it("inserts staged ready customers and vehicles and applies customer_vehicle links", async () => {
    sb = createFakeSupabase({
      entities: [
        stagedCustomer("c1", { normalized: { sourceCustomerId: "C-c1", name: "Jane Doe", email: "jane@example.com", phone: "555-111-2222" } }),
        stagedVehicle("v1", { normalized: { sourceVehicleId: "V-v1", vin: "VIN111", plate: "ABC111", year: "2020", make: "Ford", model: "F150" } }),
      ],
      links: [{ id: "l1", shop_id: "shop-1", session_id: "session-1", from_entity_id: "c1", to_entity_id: "v1", link_type: "customer_vehicle" }],
    });

    const result = await runActivation(sb);

    expect(result.customersInserted).toBe(1);
    expect(result.vehiclesInserted).toBe(1);
    expect(result.customerVehicleLinksCreated).toBe(1);
    expect(sb.state.customers).toHaveLength(1);
    expect(sb.state.vehicles).toHaveLength(1);
    expect(sb.state.vehicles[0]?.customer_id).toBe(sb.state.customers[0]?.id);
  });

  it("is idempotent on second run with no duplicates", async () => {
    sb = createFakeSupabase({
      entities: [stagedCustomer("c1"), stagedVehicle("v1")],
      links: [{ id: "l1", shop_id: "shop-1", session_id: "session-1", from_entity_id: "c1", to_entity_id: "v1", link_type: "customer_vehicle" }],
    });

    const first = await runActivation(sb);
    const second = await runActivation(sb);

    expect(first.customersInserted).toBe(1);
    expect(first.vehiclesInserted).toBe(1);
    expect(second.customersInserted).toBe(0);
    expect(second.vehiclesInserted).toBe(0);
    expect(second.customerVehicleLinksCreated).toBe(0);
    expect(sb.state.customers).toHaveLength(1);
    expect(sb.state.vehicles).toHaveLength(1);
  });

  it("does not overwrite populated live fields but fills null-safe fields", async () => {
    sb = createFakeSupabase({
      entities: [
        stagedCustomer("c1", { normalized: { sourceCustomerId: "SRC-1", name: "Ignored Name", email: "new@example.com", phone: "5559990000" }, source_external_id: "SRC-1" }),
        stagedVehicle("v1", { normalized: { sourceVehicleId: "VEH-1", vin: "VIN-1", plate: "XYZ-1", year: "2024", make: "Toyota", model: "Camry" }, source_external_id: "VEH-1" }),
      ],
      customers: [{ id: "customer-live", shop_id: "shop-1", external_id: "SRC-1", email: "existing@example.com", phone: null, phone_number: null, name: "Existing Name", first_name: null, last_name: null, business_name: null }],
      vehicles: [{ id: "vehicle-live", shop_id: "shop-1", external_id: "VEH-1", vin: "VIN-1", license_plate: null, unit_number: null, year: null, make: "Ford", model: "F150", customer_id: null }],
    });

    const result = await runActivation(sb);

    expect(result.customersUpdated).toBe(1);
    expect(result.vehiclesUpdated).toBe(1);
    expect(sb.state.customers[0]?.email).toBe("existing@example.com");
    expect(sb.state.customers[0]?.phone).toBe("5559990000");
    expect(sb.state.customers[0]?.name).toBe("Existing Name");
    expect(sb.state.vehicles[0]?.make).toBe("Ford");
    expect(sb.state.vehicles[0]?.license_plate).toBe("XYZ-1");
    expect(sb.state.vehicles[0]?.year).toBe(2024);
  });

  it("ignores cross-shop/session, non-ready, and non-customer/non-vehicle entities", async () => {
    sb = createFakeSupabase({
      entities: [
        stagedCustomer("c1"),
        stagedCustomer("c2", { shop_id: "shop-2" }),
        stagedVehicle("v1", { session_id: "session-2" }),
        stagedVehicle("v2", { status: "needs_review" }),
        stagedCustomer("c3", { entity_type: "vendor" }),
      ],
    });

    const result = await runActivation(sb);
    expect(result.stagedCustomersFound).toBe(1);
    expect(result.stagedVehiclesFound).toBe(0);
    expect(result.customersInserted).toBe(1);
    expect(result.vehiclesInserted).toBe(0);
  });

  it("skips ambiguous matches with warnings", async () => {
    sb = createFakeSupabase({
      entities: [stagedCustomer("c1", { normalized: { name: "Acme", businessName: "Acme" }, source_external_id: null })],
      customers: [
        { id: "customer-1", shop_id: "shop-1", external_id: null, email: null, phone: null, phone_number: null, name: "Acme", first_name: null, last_name: null, business_name: null },
        { id: "customer-2", shop_id: "shop-1", external_id: null, email: null, phone: null, phone_number: null, name: "Acme", first_name: null, last_name: null, business_name: null },
      ],
    });

    const result = await runActivation(sb);
    expect(result.customersSkipped).toBe(1);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("only writes to customers/vehicles tables", async () => {
    sb = createFakeSupabase({
      entities: [stagedCustomer("c1"), stagedVehicle("v1")],
    });

    await runActivation(sb);
    expect(sb.state.writes.every((write) => write.startsWith("customers:") || write.startsWith("vehicles:"))).toBe(true);
  });
});
