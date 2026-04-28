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
type ReviewItem = {
  id: string;
  shop_id: string;
  session_id: string;
  issue_type: string;
  link_id: string | null;
  status: string;
  summary: string;
  details: Record<string, unknown>;
  severity: string;
  domain: string | null;
  entity_id: string | null;
  resolved_at?: string | null;
};

function createFakeSupabase(seed?: {
  entities?: Entity[];
  links?: Link[];
  customers?: Customer[];
  vehicles?: Vehicle[];
  reviewItems?: ReviewItem[];
  failCustomerInsertForEmails?: string[];
  conflictRecoveryCustomerByEmail?: Record<string, Customer>;
}) {
  const failEmails = new Set((seed?.failCustomerInsertForEmails ?? []).map((email) => email.trim().toLowerCase()));
  const recoveryCustomers = new Map(
    Object.entries(seed?.conflictRecoveryCustomerByEmail ?? {}).map(([email, customer]) => [email.trim().toLowerCase(), customer]),
  );
  const state = {
    entities: [...(seed?.entities ?? [])],
    links: [...(seed?.links ?? [])],
    customers: [...(seed?.customers ?? [])],
    vehicles: [...(seed?.vehicles ?? [])],
    reviewItems: [...(seed?.reviewItems ?? [])],
    nextCustomerId: 1,
    nextVehicleId: 1,
    writes: [] as string[],
    customerInsertAttemptsByEmail: new Map<string, number>(),
  };

  return {
    state,
    from(table: string) {
      const query: any = {
        table,
        op: "select",
        payload: null as any,
        filters: [] as Array<{ k: string; v: any; op: "eq" | "in" }>,
        notFilters: [] as Array<{ k: string; op: string; v: any }>,
        selectOpts: null as any,
        rangeFrom: null as number | null,
        rangeTo: null as number | null,
        select(_columns: string, options?: any) {
          this.selectOpts = options ?? null;
          if (!this.op) this.op = "select";
          return this;
        },
        order() { return this; },
        range(from: number, to: number) { this.rangeFrom = from; this.rangeTo = to; return this; },
        eq(k: string, v: any) { this.filters.push({ k, v, op: "eq" }); return this; },
        in(k: string, v: any[]) { this.filters.push({ k, v, op: "in" }); return this; },
        not(k: string, op: string, v: any) { this.notFilters.push({ k, op, v }); return this; },
        update(payload: any) { this.op = "update"; this.payload = payload; return this; },
        insert(payload: any) { this.op = "insert"; this.payload = payload; return this; },
        upsert(payload: any) { this.op = "upsert"; this.payload = payload; return this; },
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
            for (const filter of this.notFilters) {
              if (filter.op === "is" && filter.v === null) {
                filtered = filtered.filter((row) => row[filter.k] !== null && row[filter.k] !== undefined);
              }
            }
            if (typeof this.rangeFrom === "number" && typeof this.rangeTo === "number") {
              return filtered.slice(this.rangeFrom, this.rangeTo + 1);
            }
            if (!this.selectOpts?.head && this.op === "select" && (this.table === "onboarding_entities" || this.table === "onboarding_entity_links" || this.table === "customers" || this.table === "vehicles" || this.table === "onboarding_review_items")) {
              return filtered.slice(0, 1000);
            }
            return filtered;
          };

          if (this.table === "onboarding_entities" && this.op === "select") return { data: applyFilters(state.entities), error: null };
          if (this.table === "onboarding_entity_links" && this.op === "select") return { data: applyFilters(state.links), error: null };
          if (this.table === "onboarding_review_items" && this.op === "select") return { data: applyFilters(state.reviewItems), error: null };

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
            const normalizedEmail = String(this.payload?.email ?? "").trim().toLowerCase();
            if (normalizedEmail) {
              state.customerInsertAttemptsByEmail.set(normalizedEmail, (state.customerInsertAttemptsByEmail.get(normalizedEmail) ?? 0) + 1);
            }
            if (normalizedEmail && failEmails.has(normalizedEmail)) {
              const recoveryCustomer = recoveryCustomers.get(normalizedEmail);
              if (recoveryCustomer && !state.customers.find((row) => row.id === recoveryCustomer.id)) {
                state.customers.push(recoveryCustomer);
              }
              return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint \"customers_shop_email_uq\"" } };
            }
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

          if (this.table === "onboarding_review_items" && this.op === "upsert") {
            const rows = Array.isArray(this.payload) ? this.payload : [this.payload];
            for (const row of rows) {
              const existingIndex = state.reviewItems.findIndex((item) => item.id === row.id);
              if (existingIndex >= 0) state.reviewItems[existingIndex] = { ...state.reviewItems[existingIndex], ...row };
              else state.reviewItems.push(row);
            }
            state.writes.push("onboarding_review_items:upsert");
            return { data: rows, error: null };
          }

          if (this.table === "onboarding_review_items" && this.op === "update") {
            const target = applyFilters(state.reviewItems)[0];
            if (target) Object.assign(target, this.payload);
            state.writes.push("onboarding_review_items:update");
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

  it("dedupes 3 staged rows by email and matches existing live customer", async () => {
    sb = createFakeSupabase({
      entities: [
        stagedCustomer("c1", { normalized: { sourceCustomerId: "dup-1", email: "dup@example.com", name: "Dupe A", phone: null } }),
        stagedCustomer("c2", { normalized: { sourceCustomerId: "dup-2", email: "DUP@example.com", name: "Dupe B", phone: "555-111-2222" } }),
        stagedCustomer("c3", { normalized: { sourceCustomerId: "dup-3", email: " dup@example.com ", name: "Dupe C", phone: null } }),
      ],
      customers: [
        { id: "customer-live", shop_id: "shop-1", external_id: null, email: "dup@example.com", phone: null, phone_number: null, name: "Existing", first_name: null, last_name: null, business_name: null },
      ],
    });

    const result = await runActivation(sb);

    expect(result.stagedCustomersFound).toBe(3);
    expect(result.customerActivationCandidates).toBe(1);
    expect(result.customersInserted).toBe(0);
    expect(result.customersSkippedDuplicateStaged).toBe(2);
    expect(result.customersUpdated + result.customersMatchedExisting).toBe(1);
    expect(sb.state.customerInsertAttemptsByEmail.get("dup@example.com") ?? 0).toBe(0);
  });

  it("if staged email exists live, activation never attempts insert", async () => {
    sb = createFakeSupabase({
      entities: [stagedCustomer("c1", { normalized: { sourceCustomerId: "src-1", email: "exists@example.com", phone: null } })],
      customers: [
        { id: "customer-live", shop_id: "shop-1", external_id: null, email: "exists@example.com", phone: "555", phone_number: "555", name: "Live", first_name: null, last_name: null, business_name: null },
      ],
    });

    const result = await runActivation(sb);

    expect(result.customersInserted).toBe(0);
    expect(result.customersUpdated + result.customersMatchedExisting).toBe(1);
    expect(sb.state.customerInsertAttemptsByEmail.get("exists@example.com") ?? 0).toBe(0);
  });

  it("recovers when insert hits customers_shop_email_uq", async () => {
    sb = createFakeSupabase({
      entities: [stagedCustomer("c1", { normalized: { sourceCustomerId: "src-1", email: "recover@example.com", phone: "5559990000" } })],
      failCustomerInsertForEmails: ["recover@example.com"],
      conflictRecoveryCustomerByEmail: {
        "recover@example.com": { id: "customer-live", shop_id: "shop-1", external_id: null, email: "recover@example.com", phone: null, phone_number: null, name: "Live", first_name: null, last_name: null, business_name: null },
      },
    });

    const result = await runActivation(sb);

    expect(result.customersRecoveredFromUniqueConflict).toBe(1);
    expect(result.customersInserted).toBe(0);
    expect(sb.state.customers).toHaveLength(1);
  });

  it("is idempotent on second run", async () => {
    sb = createFakeSupabase({
      entities: [stagedCustomer("c1"), stagedVehicle("v1")],
      links: [{ id: "l1", shop_id: "shop-1", session_id: "session-1", from_entity_id: "c1", to_entity_id: "v1", link_type: "customer_vehicle" }],
    });

    const first = await runActivation(sb);
    const second = await runActivation(sb);

    expect(first.customersInserted).toBe(1);
    expect(second.customersInserted).toBe(0);
    expect(second.customersAfter).toBe(first.customersAfter);
    expect(sb.state.customers).toHaveLength(1);
  });

  it("vehicle links still resolve to canonical live customer after staged customer dedupe", async () => {
    sb = createFakeSupabase({
      entities: [
        stagedCustomer("c1", { normalized: { sourceCustomerId: "SRC-1", email: "canon@example.com", name: "Canon" } }),
        stagedCustomer("c2", { normalized: { sourceCustomerId: "SRC-2", email: "canon@example.com", name: "Canon" } }),
        stagedVehicle("v1", { normalized: { sourceVehicleId: "V-1", sourceCustomerId: "SRC-2", vin: "VIN-1", plate: "P-1", year: "2020", make: "Ford", model: "F150" } }),
      ],
      links: [{ id: "l1", shop_id: "shop-1", session_id: "session-1", from_entity_id: "c2", to_entity_id: "v1", link_type: "customer_vehicle" }],
    });

    const result = await runActivation(sb);

    expect(result.customersInserted).toBe(1);
    expect(result.customersSkippedDuplicateStaged).toBe(1);
    expect(result.vehicleCustomerLinksMaterialized + result.vehicleCustomerLinksSkipped).toBeGreaterThan(0);
    expect(sb.state.vehicles[0]?.customer_id).toBe(sb.state.customers[0]?.id);
  });

  it("ignores cross-shop live customers with same email", async () => {
    sb = createFakeSupabase({
      entities: [stagedCustomer("c1", { normalized: { sourceCustomerId: "x-1", email: "same@example.com", name: "New" } })],
      customers: [
        { id: "customer-shop2", shop_id: "shop-2", external_id: null, email: "same@example.com", phone: null, phone_number: null, name: "Other shop", first_name: null, last_name: null, business_name: null },
      ],
    });

    const result = await runActivation(sb);

    expect(result.customersInserted).toBe(1);
    expect(result.customersAfter).toBe(1);
  });

  it("skips ambiguous live matches with warning", async () => {
    sb = createFakeSupabase({
      entities: [stagedCustomer("c1", { normalized: { sourceCustomerId: null, email: null, phone: "5551112222", businessName: null, name: "Ambig" }, source_external_id: null })],
      customers: [
        { id: "customer-1", shop_id: "shop-1", external_id: null, email: "a1@example.com", phone: "5551112222", phone_number: "5551112222", name: "One", first_name: null, last_name: null, business_name: null },
        { id: "customer-2", shop_id: "shop-1", external_id: null, email: "a2@example.com", phone: "5551112222", phone_number: "5551112222", name: "Two", first_name: null, last_name: null, business_name: null },
      ],
    });

    const result = await runActivation(sb);

    expect(result.customersSkippedAmbiguous).toBe(1);
    expect(result.warnings.some((warning) => warning.includes("ambiguous"))).toBe(true);
  });

  it("paginates full staged customer/vehicle/link sets and processes links past first 1000", async () => {
    const customers = Array.from({ length: 1800 }, (_, index) => stagedCustomer(`c${index + 1}`, {
      normalized: { sourceCustomerId: `C-${index + 1}`, email: `customer${index + 1}@example.com`, name: `Customer ${index + 1}` },
      source_external_id: `C-${index + 1}`,
    }));
    const vehicles = Array.from({ length: 2600 }, (_, index) => stagedVehicle(`v${index + 1}`, {
      normalized: {
        sourceVehicleId: `V-${index + 1}`,
        sourceCustomerId: `C-${(index % 1800) + 1}`,
        vin: `VIN${String(index + 1).padStart(6, "0")}`,
        plate: `PLATE${index + 1}`,
        year: "2022",
        make: "Ford",
        model: "Transit",
      },
      source_external_id: `V-${index + 1}`,
    }));
    const links = Array.from({ length: 2600 }, (_, index) => ({
      id: `l${index + 1}`,
      shop_id: "shop-1",
      session_id: "session-1",
      from_entity_id: `c${(index % 1800) + 1}`,
      to_entity_id: `v${index + 1}`,
      link_type: "customer_vehicle",
    }));

    sb = createFakeSupabase({ entities: [...customers, ...vehicles], links });

    const result = await runActivation(sb);

    expect(result.stagedCustomersFound).toBe(1800);
    expect(result.stagedVehiclesFound).toBe(2600);
    expect(result.stagedCustomerVehicleLinksFound).toBe(2600);
    expect(result.stagedCustomersFound).not.toBe(405);
    expect(result.stagedVehiclesFound).not.toBe(595);
    expect(result.stagedCustomerVehicleLinksFound).not.toBe(1000);
    expect(result.vehiclesAfter).toBe(2600);
    expect(result.vehicleCustomerLinksAttempted).toBe(2600);
    expect(result.vehicleCustomerLinksMaterialized).toBe(2600);
    expect(result.vehicleCustomerLinksUnresolved).toBe(0);
    expect(result.liveVehicleCustomerLinksAfter).toBe(2600);
    expect(sb.state.vehicles[1500]?.customer_id).toBeTruthy();
  });

  it("maps duplicate staged customer ids to one live customer and links past 1000 stay idempotent", async () => {
    const entities: Entity[] = [
      stagedCustomer("c1", { normalized: { sourceCustomerId: "SRC-ONE", email: "one@example.com", name: "One" } }),
      stagedCustomer("c2", { normalized: { sourceCustomerId: "SRC-TWO", email: "one@example.com", name: "One Duplicate" } }),
      ...Array.from({ length: 2600 }, (_, index) => stagedVehicle(`v${index + 1}`, {
        normalized: {
          sourceVehicleId: `V-${index + 1}`,
          sourceCustomerId: index >= 1000 ? "SRC-TWO" : "SRC-ONE",
          vin: `VIN${String(index + 1).padStart(6, "0")}`,
          plate: `P${index + 1}`,
          year: "2021",
          make: "Toyota",
          model: "Camry",
        },
      })),
    ];
    const links: Link[] = Array.from({ length: 2600 }, (_, index) => ({
      id: `l${index + 1}`,
      shop_id: "shop-1",
      session_id: "session-1",
      from_entity_id: index >= 1000 ? "c2" : "c1",
      to_entity_id: `v${index + 1}`,
      link_type: "customer_vehicle",
    }));

    sb = createFakeSupabase({
      entities,
      links,
      customers: [
        { id: "customer-live", shop_id: "shop-1", external_id: null, email: "one@example.com", phone: null, phone_number: null, name: "Existing One", first_name: null, last_name: null, business_name: null },
      ],
    });

    const first = await runActivation(sb);
    const second = await runActivation(sb);

    expect(first.customersInserted).toBe(0);
    expect(first.customersMatchedExisting + first.customersUpdated).toBe(1);
    expect(first.customersSkippedDuplicateStaged).toBe(1);
    expect(sb.state.customerInsertAttemptsByEmail.get("one@example.com") ?? 0).toBe(0);
    expect(sb.state.vehicles[1500]?.customer_id).toBe("customer-live");
    expect(first.vehicleCustomerLinksCreated).toBeGreaterThan(1000);
    expect(second.vehicleCustomerLinksCreated).toBe(0);
    expect(second.vehicleCustomerLinksAlreadyCorrect).toBe(2600);
  });

  it("materializes reversed customer_vehicle link direction", async () => {
    sb = createFakeSupabase({
      entities: [stagedCustomer("c1"), stagedVehicle("v1")],
      links: [{ id: "l1", shop_id: "shop-1", session_id: "session-1", from_entity_id: "v1", to_entity_id: "c1", link_type: "customer_vehicle" }],
    });

    const result = await runActivation(sb);

    expect(result.vehicleCustomerLinksMaterialized).toBe(1);
    expect(result.vehicleCustomerLinksUnresolved).toBe(0);
    expect(sb.state.vehicles[0]?.customer_id).toBe(sb.state.customers[0]?.id);
  });

  it("returns structured unresolved issue for ambiguous customer link", async () => {
    sb = createFakeSupabase({
      entities: [
        stagedCustomer("c1", { normalized: { sourceCustomerId: null, email: null, phone: "5551112222", businessName: null, name: "Ambig" }, source_external_id: null }),
        stagedVehicle("v1", { normalized: { sourceVehicleId: "V-1", vin: "VIN-1", plate: "P-1", year: "2020", make: "Ford", model: "F150" } }),
      ],
      links: [{ id: "l1", shop_id: "shop-1", session_id: "session-1", from_entity_id: "c1", to_entity_id: "v1", link_type: "customer_vehicle" }],
      customers: [
        { id: "customer-1", shop_id: "shop-1", external_id: null, email: "a1@example.com", phone: "5551112222", phone_number: "5551112222", name: "One", first_name: null, last_name: null, business_name: null },
        { id: "customer-2", shop_id: "shop-1", external_id: null, email: "a2@example.com", phone: "5551112222", phone_number: "5551112222", name: "Two", first_name: null, last_name: null, business_name: null },
      ],
    });

    const result = await runActivation(sb);

    expect(result.vehicleCustomerLinksUnresolved).toBe(1);
    expect(result.customerVehicleLinkIssues).toHaveLength(1);
    expect(result.customerVehicleLinkIssues[0]?.reason).toBe("ambiguous_customer_match");
    expect(result.customerVehicleLinkIssues[0]?.stagedCustomerSummary?.name).toBe("Ambig");
  });

  it("marks already-linked vehicles as alreadyCorrect and counts live links after from db", async () => {
    sb = createFakeSupabase({
      entities: [stagedCustomer("c1"), stagedVehicle("v1")],
      links: [{ id: "l1", shop_id: "shop-1", session_id: "session-1", from_entity_id: "c1", to_entity_id: "v1", link_type: "customer_vehicle" }],
      customers: [{ id: "customer-live", shop_id: "shop-1", external_id: "C-c1", email: null, phone: null, phone_number: null, name: "Existing", first_name: null, last_name: null, business_name: null }],
      vehicles: [{ id: "vehicle-live", shop_id: "shop-1", external_id: "V-v1", vin: "VINv1", license_plate: "ABCv1", unit_number: null, year: 2020, make: "Ford", model: "F150", customer_id: "customer-live" }],
    });

    const result = await runActivation(sb);
    expect(result.vehicleCustomerLinksAlreadyCorrect).toBe(1);
    expect(result.liveVehicleCustomerLinksAfter).toBe(1);
  });

  it("returns unresolved issue when vehicle is linked to different customer", async () => {
    sb = createFakeSupabase({
      entities: [stagedCustomer("c1"), stagedVehicle("v1")],
      links: [{ id: "l1", shop_id: "shop-1", session_id: "session-1", from_entity_id: "c1", to_entity_id: "v1", link_type: "customer_vehicle" }],
      customers: [
        { id: "customer-live", shop_id: "shop-1", external_id: "C-c1", email: "a@example.com", phone: null, phone_number: null, name: "Target", first_name: null, last_name: null, business_name: null },
        { id: "customer-other", shop_id: "shop-1", external_id: "other", email: "other@example.com", phone: null, phone_number: null, name: "Other", first_name: null, last_name: null, business_name: null },
      ],
      vehicles: [{ id: "vehicle-live", shop_id: "shop-1", external_id: "V-v1", vin: "VINv1", license_plate: "ABCv1", unit_number: null, year: 2020, make: "Ford", model: "F150", customer_id: "customer-other" }],
    });

    const result = await runActivation(sb);

    expect(result.vehicleCustomerLinksSkipped).toBe(1);
    expect(result.vehicleCustomerLinksUnresolved).toBe(1);
    expect(result.customerVehicleLinkIssues[0]?.reason).toBe("vehicle_linked_to_different_customer");
  });

  it("persists unresolved review items idempotently across reruns", async () => {
    sb = createFakeSupabase({
      entities: [
        stagedCustomer("c1", { normalized: { sourceCustomerId: null, email: null, phone: "5551112222", businessName: null, name: "Ambig" }, source_external_id: null }),
        stagedVehicle("v1", { normalized: { sourceVehicleId: "V-1", vin: "VIN-1", plate: "P-1", year: "2020", make: "Ford", model: "F150" } }),
      ],
      links: [{ id: "l1", shop_id: "shop-1", session_id: "session-1", from_entity_id: "c1", to_entity_id: "v1", link_type: "customer_vehicle" }],
      customers: [
        { id: "customer-1", shop_id: "shop-1", external_id: null, email: "a1@example.com", phone: "5551112222", phone_number: "5551112222", name: "One", first_name: null, last_name: null, business_name: null },
        { id: "customer-2", shop_id: "shop-1", external_id: null, email: "a2@example.com", phone: "5551112222", phone_number: "5551112222", name: "Two", first_name: null, last_name: null, business_name: null },
      ],
    });

    await runActivation(sb);
    await runActivation(sb);

    const unresolved = sb.state.reviewItems.filter((item) => item.issue_type === "unresolved_customer_vehicle_link");
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0]?.details?.reasonCode).toBe("ambiguous_customer_match");
  });
});
