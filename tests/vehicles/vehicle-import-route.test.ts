import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../../app/api/vehicles/import/route";

const { mockSupabaseState } = vi.hoisted(() => ({
  mockSupabaseState: {
    user: { id: "user-1" } as { id: string } | null,
    profileShopId: "shop-real" as string | null,
    customers: [] as Array<Record<string, unknown>>,
    vehicles: [] as Array<Record<string, unknown>>,
    inserts: [] as Array<Record<string, unknown>>,
    updates: [] as Array<{ payload: Record<string, unknown>; filters: Record<string, unknown> }>,
    customerRanges: [] as Array<{ from: number; to: number; shopId: unknown }>,
    vehicleRanges: [] as Array<{ from: number; to: number; shopId: unknown }>,
    insertErrors: [] as Array<Record<string, unknown>>,
    insertCallCount: 0,
    duplicateLookupCount: 0,
    duplicateRecoveryVehicles: [] as Array<Record<string, unknown>>,
  },
}));

vi.mock("next/headers", () => ({ cookies: vi.fn() }));

type MockQuery = {
  filters: Record<string, unknown>;
  payload?: Record<string, unknown>;
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  ilike: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  range: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

function makeQuery(table: string): MockQuery {
  const query: MockQuery = {
    filters: {},
    select: vi.fn(() => query),
    eq: vi.fn((column: string, value: unknown) => { query.filters[column] = value; return query; }),
    ilike: vi.fn((column: string, value: unknown) => { query.filters[column] = value; return query; }),
    limit: vi.fn(() => query),
    order: vi.fn(() => query),
    range: vi.fn((from: number, to: number) => {
      if (table === "customers" && query.filters.shop_id && !query.filters.id) {
        mockSupabaseState.customerRanges.push({ from, to, shopId: query.filters.shop_id });
        return Promise.resolve({ data: mockSupabaseState.customers.filter((row) => row.shop_id === query.filters.shop_id).slice(from, to + 1), error: null });
      }
      if (table === "vehicles" && query.filters.shop_id) {
        mockSupabaseState.vehicleRanges.push({ from, to, shopId: query.filters.shop_id });
        return Promise.resolve({ data: mockSupabaseState.vehicles.filter((row) => row.shop_id === query.filters.shop_id).slice(from, to + 1), error: null });
      }
      return query;
    }),
    maybeSingle: vi.fn(async () => {
      if (table === "profiles") return { data: { shop_id: mockSupabaseState.profileShopId }, error: null };
      if (table === "customers") {
        const found = mockSupabaseState.customers.find((row) => row.id === query.filters.id && row.shop_id === query.filters.shop_id);
        return { data: found ?? null, error: null };
      }
      if (table === "vehicles") {
        mockSupabaseState.duplicateLookupCount += 1;
        const lookupRows = [...mockSupabaseState.vehicles, ...mockSupabaseState.duplicateRecoveryVehicles];
        const found = lookupRows.find((row) => {
          if (row.shop_id !== query.filters.shop_id) return false;
          if (query.filters.vin) return row.vin === query.filters.vin;
          if (query.filters.external_id) return row.external_id === query.filters.external_id;
          if (query.filters.unit_number) return String(row.unit_number).toLowerCase() === String(query.filters.unit_number).toLowerCase();
          if (query.filters.license_plate) return row.license_plate === query.filters.license_plate;
          return false;
        });
        return { data: found ?? null, error: null };
      }
      return { data: null, error: null };
    }),
    insert: vi.fn(async (payload: Record<string, unknown> | Array<Record<string, unknown>>) => {
      mockSupabaseState.insertCallCount += 1;
      if (mockSupabaseState.insertErrors.length > 0) return { error: mockSupabaseState.insertErrors.shift() ?? null };
      const rows = Array.isArray(payload) ? payload : [payload];
      mockSupabaseState.inserts.push(...rows);
      mockSupabaseState.vehicles.push(...rows.map((row) => ({ id: `vehicle-${mockSupabaseState.vehicles.length + 1}`, ...row })));
      return { error: null };
    }),
    update: vi.fn((payload: Record<string, unknown>) => {
      query.payload = payload;
      return query;
    }),
  };
  query.eq = vi.fn((column: string, value: unknown) => {
    query.filters[column] = value;
    if (table === "vehicles" && query.payload && column === "id") {
      mockSupabaseState.updates.push({ payload: query.payload, filters: { ...query.filters } });
    }
    return query;
  });
  query.select = vi.fn(() => query);
  return query;
}

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createServerSupabaseRoute: vi.fn(() => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: mockSupabaseState.user }, error: null })) },
    from: vi.fn((table: string) => makeQuery(table)),
  })),
}));

function request(rows: unknown[]) {
  return new Request("http://localhost/api/vehicles/import", { method: "POST", body: JSON.stringify({ rows, shop_id: "evil-shop" }) });
}

describe("POST /api/vehicles/import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseState.user = { id: "user-1" };
    mockSupabaseState.profileShopId = "shop-real";
    mockSupabaseState.customers = [];
    mockSupabaseState.vehicles = [];
    mockSupabaseState.inserts = [];
    mockSupabaseState.updates = [];
    mockSupabaseState.customerRanges = [];
    mockSupabaseState.vehicleRanges = [];
    mockSupabaseState.insertErrors = [];
    mockSupabaseState.insertCallCount = 0;
    mockSupabaseState.duplicateLookupCount = 0;
    mockSupabaseState.duplicateRecoveryVehicles = [];
  });

  it("rejects unauthenticated import", async () => {
    mockSupabaseState.user = null;
    const response = await POST(request([{ unit_number: "A-1" }]));
    expect(response.status).toBe(401);
  });

  it("rejects no-shop profiles", async () => {
    mockSupabaseState.profileShopId = null;
    const response = await POST(request([{ unit_number: "A-1" }]));
    expect(response.status).toBe(403);
  });

  it("ignores client shop_id and inserts into authenticated shop", async () => {
    const response = await POST(request([{ unit_number: "A-1", vin: "1hgcm82633a004352" }]));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.counts.created).toBe(1);
    expect(mockSupabaseState.inserts[0]).toMatchObject({ shop_id: "shop-real", unit_number: "A-1", vin: "1HGCM82633A004352" });
    expect(mockSupabaseState.inserts[0].shop_id).not.toBe("evil-shop");
    expect(mockSupabaseState.inserts[0]).not.toHaveProperty("user_id");
  });


  it("maps supported CSV fields into the vehicle insert payload", async () => {
    const response = await POST(request([{
      vehicle_id: "veh-legacy-1",
      unit: "Unit-7",
      plate: "abc123",
      odometer: "123456",
      trim: "XL",
      notes: "Imported note",
      engine: "6.7L",
      fuel_type: "Diesel",
      engine_hours: "4567",
      shop_id: "csv-evil-shop",
    }]));

    expect(response.status).toBe(200);
    expect(mockSupabaseState.inserts[0]).toMatchObject({
      shop_id: "shop-real",
      external_id: "veh-legacy-1",
      unit_number: "Unit-7",
      license_plate: "ABC123",
      mileage: "123456",
      submodel: "XL",
      engine: "6.7L",
      fuel_type: "Diesel",
      engine_hours: 4567,
    });
    expect(String(mockSupabaseState.inserts[0].import_notes)).toContain("Imported note");
    expect(mockSupabaseState.inserts[0].shop_id).not.toBe("csv-evil-shop");
    expect(mockSupabaseState.inserts[0]).not.toHaveProperty("user_id");
  });

  it("omits CSV row numbers from source_row_id and keeps the row number in import notes", async () => {
    const response = await POST(request([{ sourceRowNumber: 2, external_id: "VEH-200000", unit: "TRK-957", plate: "C-240-T", customer_id: "CUST-100425" }]));

    expect(response.status).toBe(200);
    expect(mockSupabaseState.inserts[0]).not.toHaveProperty("source_row_id");
    expect(String(mockSupabaseState.inserts[0].import_notes)).toContain("Vehicle CSV import row 2");
    expect(mockSupabaseState.inserts[0]).not.toHaveProperty("user_id");
  });

  it("omits and warns for invalid source_row_id CSV values instead of posting them", async () => {
    const response = await POST(request([{ sourceRowNumber: 2, unit_number: "A-1", source_row_id: "2" }]));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mockSupabaseState.inserts[0]).not.toHaveProperty("source_row_id");
    expect(String(mockSupabaseState.inserts[0].import_notes)).toContain("Vehicle CSV import row 2");
    expect(payload.warnings).toContainEqual(expect.objectContaining({ row: 2, message: expect.stringMatching(/Invalid source_row_id was omitted/i) }));
  });

  it("includes valid UUID source_row_id CSV values as source row references", async () => {
    const sourceRowId = "11111111-1111-4111-8111-111111111111";
    const response = await POST(request([{ unit_number: "A-1", source_row_id: sourceRowId }]));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mockSupabaseState.inserts[0].source_row_id).toBe(sourceRowId);
    expect(payload.warnings).toEqual([]);
  });

  it("400 schema diagnostics keep payload keys and report containsUserId false without source_row_id for normal CSV rows", async () => {
    mockSupabaseState.insertErrors = [{ code: "22P02", status: 400, message: 'invalid input syntax for type uuid: "2"' }];

    const response = await POST(request([{ sourceRowNumber: 2, external_id: "VEH-200000", unit: "TRK-957", plate: "C-240-T", customer_id: "CUST-100425", user_id: "csv-user" }]));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toMatch(/Vehicle insert payload rejected by database schema/i);
    expect(payload.diagnostics[0]).toMatchObject({
      row: 2,
      external_id: "VEH-200000",
      unit_number: "TRK-957",
      plate: "C-240-T",
      customer_external_id: "CUST-100425",
      status: 400,
      containsUserId: false,
    });
    expect(payload.diagnostics[0].payloadKeys).toContain("shop_id");
    expect(payload.diagnostics[0].payloadKeys).not.toContain("source_row_id");
    expect(payload.diagnostics[0].payloadKeys).not.toContain("user_id");
    expect(JSON.stringify(payload.diagnostics[0])).not.toContain("csv-user");
  });

  it("resolves customer_external_id in the authenticated shop before customer fallback", async () => {
    mockSupabaseState.customers = [
      { id: "other-customer", shop_id: "other-shop", external_id: "cust-legacy", email: "fleet@example.com", name: "Fleet Co" },
      { id: "real-customer", shop_id: "shop-real", external_id: "cust-legacy", email: "other@example.com", name: "Other Name" },
      { id: "fallback-customer", shop_id: "shop-real", external_id: "fallback", email: "fleet@example.com", name: "Fleet Co" },
    ];

    const response = await POST(request([{ unit_number: "A-1", customer_external_id: "cust-legacy", customer_email: "fleet@example.com", customer_name: "Fleet Co" }]));

    expect(response.status).toBe(200);
    expect(mockSupabaseState.inserts[0].customer_id).toBe("real-customer");
  });

  it("treats vehicle CSV customer_id as a same-shop customer external_id", async () => {
    mockSupabaseState.customers = [
      { id: "other-customer", shop_id: "other-shop", external_id: "CUST-100425" },
      { id: "real-customer-uuid", shop_id: "shop-real", external_id: " CUST-100425 " },
    ];

    const response = await POST(request([{ vehicle_id: "VEH-1", unit_number: "A-1", customer_id: "CUST-100425", shop_id: "csv-evil-shop", user_id: "csv-user" }]));

    expect(response.status).toBe(200);
    expect(mockSupabaseState.inserts[0]).toMatchObject({
      shop_id: "shop-real",
      customer_id: "real-customer-uuid",
      external_id: "VEH-1",
    });
    expect(mockSupabaseState.inserts[0]).not.toHaveProperty("user_id");
  });

  it("paginates same-shop customer external_id lookup beyond 1000 rows", async () => {
    mockSupabaseState.customers = Array.from({ length: 1002 }, (_, index) => ({
      id: `customer-${index}`,
      shop_id: "shop-real",
      external_id: index === 1001 ? "CUST-100247" : `CUST-${index}`,
    }));

    const response = await POST(request([{ unit_number: "A-1", customer_id: "CUST-100247" }]));

    expect(response.status).toBe(200);
    expect(mockSupabaseState.customerRanges).toEqual([
      { from: 0, to: 999, shopId: "shop-real" },
      { from: 1000, to: 1999, shopId: "shop-real" },
    ]);
    expect(mockSupabaseState.inserts[0].customer_id).toBe("customer-1001");
  });

  it("does not use a non-UUID vehicle CSV customer_id as vehicles.customer_id directly", async () => {
    const response = await POST(request([{ unit_number: "A-1", customer_id: "CUST-404" }]));

    expect(response.status).toBe(200);
    expect(mockSupabaseState.inserts[0].customer_id).toBeNull();
  });

  it("does not link a missing same-shop customer external_id to another shop", async () => {
    mockSupabaseState.customers = [{ id: "other-customer", shop_id: "other-shop", external_id: "CUST-100425" }];

    const response = await POST(request([{ unit_number: "A-1", customer_id: "CUST-100425" }]));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(mockSupabaseState.inserts[0].customer_id).toBeNull();
    expect(payload.warnings[0].message).toMatch(/without a customer link/i);
  });

  it("customer email/name lookup is shop scoped", async () => {
    mockSupabaseState.customers = [
      { id: "other-customer", shop_id: "other-shop", email: "jane@example.com", name: "Jane" },
      { id: "real-customer", shop_id: "shop-real", email: "jane@example.com", name: "Jane" },
    ];
    const response = await POST(request([{ unit_number: "A-1", customer_email: "jane@example.com", customer_name: "Jane" }]));
    expect(response.status).toBe(200);
    expect(mockSupabaseState.inserts[0].customer_id).toBe("real-customer");
  });


  it.each([
    ["VIN", { vin: "1HGCM82633A004352", make: "Honda" }, { vin: "1HGCM82633A004352" }],
    ["external_id", { external_id: "veh-1", model: "Transit" }, { external_id: "veh-1" }],
    ["unit_number", { unit_number: "A-1", year: 2020 }, { unit_number: "a-1" }],
    ["license_plate", { license_plate: "ABC123", make: "Ford" }, { license_plate: "ABC123" }],
  ])("existing same-shop %s updates instead of inserting", async (_label, importRow, existingVehicle) => {
    mockSupabaseState.vehicles = [{ id: "vehicle-existing", shop_id: "shop-real", ...existingVehicle }];

    const response = await POST(request([importRow]));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.counts).toMatchObject({ created: 0, updated: 1 });
    expect(mockSupabaseState.inserts).toHaveLength(0);
    expect(mockSupabaseState.updates[0].filters).toMatchObject({ shop_id: "shop-real", id: "vehicle-existing" });
  });

  it.each([
    ["VIN", [{ vin: "1HGCM82633A004352" }, { vin: "1HGCM82633A004352", make: "Honda" }]],
    ["external_id", [{ external_id: "veh-1" }, { external_id: "veh-1", make: "Honda" }]],
    ["unit_number", [{ unit_number: "A-1" }, { unit_number: "a-1", make: "Honda" }]],
    ["license_plate", [{ license_plate: "ABC123" }, { license_plate: "abc123", make: "Honda" }]],
  ])("same-file duplicate %s is skipped", async (_label, rows) => {
    const response = await POST(request(rows));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.counts).toMatchObject({ created: 1, skipped: 1 });
    expect(mockSupabaseState.inserts).toHaveLength(1);
  });

  it.each([
    ["VIN", { vin: "1HGCM82633A004352" }],
    ["external_id", { external_id: "veh-1" }],
    ["unit_number", { unit_number: "A-1" }],
    ["license_plate", { license_plate: "ABC123" }],
  ])("cross-shop duplicate %s does not block current shop import", async (_label, identity) => {
    mockSupabaseState.vehicles = [{ id: "other-vehicle", shop_id: "other-shop", ...identity }];

    const response = await POST(request([identity]));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.counts).toMatchObject({ created: 1, updated: 0 });
    expect(mockSupabaseState.inserts).toHaveLength(1);
  });

  it("sparse duplicate import does not erase existing non-empty fields", async () => {
    mockSupabaseState.vehicles = [{ id: "vehicle-existing", shop_id: "shop-real", vin: "1HGCM82633A004352", make: "Ford", model: "F-150", mileage: "1000" }];

    const response = await POST(request([{ vin: "1HGCM82633A004352", unit_number: "A-1" }]));

    expect(response.status).toBe(200);
    expect(mockSupabaseState.updates[0].payload).toMatchObject({ vin: "1HGCM82633A004352", unit_number: "A-1" });
    expect(mockSupabaseState.updates[0].payload).not.toHaveProperty("make");
    expect(mockSupabaseState.updates[0].payload).not.toHaveProperty("model");
    expect(mockSupabaseState.updates[0].payload).not.toHaveProperty("mileage");
  });

  it("conflicting weak match does not overwrite VIN", async () => {
    mockSupabaseState.vehicles = [{ id: "vehicle-existing", shop_id: "shop-real", unit_number: "A-1", vin: "1HGCM82633A004352" }];

    const response = await POST(request([{ unit_number: "A-1", vin: "2HGCM82633A004352" }]));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.counts).toMatchObject({ created: 0, updated: 0, skipped: 1 });
    expect(mockSupabaseState.updates).toHaveLength(0);
    expect(mockSupabaseState.inserts).toHaveLength(0);
    expect(payload.warnings[0].message).toMatch(/conflicts/i);
  });

  it("duplicate VIN is not inserted twice", async () => {
    const response = await POST(request([{ vin: "1HGCM82633A004352" }, { vin: "1HGCM82633A004352" }]));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.counts).toMatchObject({ created: 1, skipped: 1 });
    expect(mockSupabaseState.inserts).toHaveLength(1);
  });

  it("duplicate unit number without a stronger identity is handled/skipped", async () => {
    const response = await POST(request([{ unit_number: "A-1" }, { unit_number: "a-1" }]));
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.counts).toMatchObject({ created: 1, skipped: 1 });
    expect(mockSupabaseState.inserts).toHaveLength(1);
    expect(payload.warnings[0].message).toMatch(/no unique VIN or external vehicle ID/i);
  });

  it("duplicate unit number does not block unique VIN or external vehicle ID imports", async () => {
    const response = await POST(request([
      { vehicle_id: "VEH-1", unit_number: "A-1", vin: "1HGCM82633A004352" },
      { vehicle_id: "VEH-2", unit_number: "a-1", vin: "2HGCM82633A004352" },
    ]));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.counts).toMatchObject({ created: 2, skipped: 0 });
    expect(mockSupabaseState.inserts).toHaveLength(2);
    expect(payload.warnings[0].message).toMatch(/continuing because VIN or external vehicle ID/i);
  });
  it("large import prefetches customers and vehicles instead of per-row lookups", async () => {
    mockSupabaseState.customers = Array.from({ length: 1001 }, (_, index) => ({
      id: `customer-${index}`,
      shop_id: "shop-real",
      external_id: `CUST-${index}`,
    }));
    mockSupabaseState.vehicles = Array.from({ length: 1001 }, (_, index) => ({
      id: `existing-${index}`,
      shop_id: "shop-real",
      vin: `EXISTINGVIN${index}`,
    }));
    const rows = Array.from({ length: 2600 }, (_, index) => ({ unit_number: `UNIT-${index}`, customer_id: `CUST-${index % 1001}` }));

    const response = await POST(request(rows));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.counts.created).toBe(2600);
    expect(mockSupabaseState.customerRanges).toEqual([
      { from: 0, to: 999, shopId: "shop-real" },
      { from: 1000, to: 1999, shopId: "shop-real" },
    ]);
    expect(mockSupabaseState.vehicleRanges).toEqual([
      { from: 0, to: 999, shopId: "shop-real" },
      { from: 1000, to: 1999, shopId: "shop-real" },
    ]);
    expect(mockSupabaseState.duplicateLookupCount).toBe(0);
    expect(mockSupabaseState.insertCallCount).toBe(26);
  });

  it("PostgREST 400 insert error is not retried and returns a safe diagnostic", async () => {
    mockSupabaseState.insertErrors = [{ code: "PGRST204", status: 400, message: "Could not find the 'import_notes' column", details: "schema cache", hint: "reload schema" }];

    const response = await POST(request([{ unit_number: "A-1", vin: "1HGCM82633A004352", user_id: "csv-user" }]));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(mockSupabaseState.insertCallCount).toBe(1);
    expect(payload.error).toMatch(/payload rejected/i);
    expect(payload.diagnostics[0]).toMatchObject({
      row: 1,
      vin: "1HGCM82633A004352",
      unit_number: "A-1",
      code: "PGRST204",
      status: 400,
      containsUserId: false,
    });
    expect(payload.diagnostics[0].payloadKeys).toContain("shop_id");
    expect(payload.diagnostics[0].payloadKeys).not.toContain("user_id");
    expect(JSON.stringify(payload.diagnostics[0])).not.toContain("csv-user");
  });

  it("duplicate conflict recovery re-queries a deterministic same-shop vehicle once", async () => {
    mockSupabaseState.insertErrors = [{ code: "23505", status: 409, message: "duplicate key value violates unique constraint" }];
    mockSupabaseState.duplicateRecoveryVehicles = [{ id: "vehicle-existing", shop_id: "shop-real", vin: "1HGCM82633A004352" }];

    const response = await POST(request([{ vin: "1HGCM82633A004352", make: "Honda" }]));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.counts).toMatchObject({ created: 0, updated: 1 });
    expect(mockSupabaseState.insertCallCount).toBe(1);
    expect(mockSupabaseState.duplicateLookupCount).toBe(1);
    expect(mockSupabaseState.updates[0].filters).toMatchObject({ shop_id: "shop-real", id: "vehicle-existing" });
  });

  it("returns promptly on schema rejection instead of attempting later batches", async () => {
    mockSupabaseState.insertErrors = [{ code: "PGRST204", status: 400, message: "unknown vehicle column" }];
    const rows = Array.from({ length: 250 }, (_, index) => ({ unit_number: `UNIT-${index}` }));

    const response = await POST(request(rows));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(mockSupabaseState.insertCallCount).toBe(1);
    expect(payload.counts.created).toBe(0);
    expect(payload.diagnostics[0].payloadKeys).toContain("unit_number");
  });

});
