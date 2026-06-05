import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireShopScopedApiAccess: vi.fn(),
  createAdminSupabase: vi.fn(),
}));

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: mocks.requireShopScopedApiAccess,
}));

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: mocks.createAdminSupabase,
}));

type Row = Record<string, any>;
type Store = Record<string, Row[]>;
type Operation = { table: string; op: string; filters: Record<string, any>; inFilters: Record<string, any[]>; payload?: any };

class Query {
  filters: Record<string, any> = {};
  inFilters: Record<string, any[]> = {};
  selectValue = "*";
  constructor(private table: string, private store: Store, private operations: Operation[], private op = "select", private payload?: any) {}
  select(value = "*") { this.selectValue = value; return this; }
  eq(k: string, v: any) { this.filters[k] = v; return this; }
  in(k: string, v: any[]) { this.inFilters[k] = v; return this; }
  is(k: string, v: any) { this.filters[k] = v; return this; }
  ilike(k: string, v: string) { this.filters[k] = v.replaceAll("%", "").toLowerCase(); return this; }
  order() { return this; }
  limit() { return this; }
  update(payload: any) { const q = new Query(this.table, this.store, this.operations, "update", payload); q.filters = { ...this.filters }; q.inFilters = { ...this.inFilters }; return q; }
  upsert(payload: any) { const q = new Query(this.table, this.store, this.operations, "upsert", payload); q.filters = { ...this.filters }; q.inFilters = { ...this.inFilters }; return q; }
  async maybeSingle() { const v = await this; return { data: Array.isArray(v.data) ? v.data[0] ?? null : v.data, error: v.error }; }
  then(resolve: (value: { data: any; error: any }) => void, _reject?: (reason?: any) => void) {
    this.operations.push({ table: this.table, op: this.op, filters: { ...this.filters }, inFilters: { ...this.inFilters }, payload: this.payload });
    let rows = [...(this.store[this.table] ?? [])];
    for (const [key, value] of Object.entries(this.filters)) {
      rows = rows.filter((row) => String(row[key] ?? "").toLowerCase() === String(value ?? "").toLowerCase());
    }
    for (const [key, values] of Object.entries(this.inFilters)) rows = rows.filter((row) => values.includes(row[key]));
    if (this.op === "update") {
      rows.forEach((row) => Object.assign(row, this.payload));
      resolve({ data: rows, error: null });
      return;
    }
    if (this.op === "upsert") {
      const payloads = Array.isArray(this.payload) ? this.payload : [this.payload];
      this.store[this.table] = [...(this.store[this.table] ?? []), ...payloads];
      resolve({ data: payloads, error: null });
      return;
    }
    resolve({ data: rows, error: null });
  }
}

function setup(store: Store, actor = { id: "owner-1", role: "owner", shop_id: "shop-a" }) {
  const operations: Operation[] = [];
  const admin = { from: vi.fn((table: string) => new Query(table, store, operations)) };
  mocks.createAdminSupabase.mockReturnValue(admin);
  mocks.requireShopScopedApiAccess.mockResolvedValue({ ok: true, profile: actor, canonicalRole: actor.role, supabase: {} });
  return { operations, admin };
}

function post(body: any) {
  return new Request("http://localhost/api/work-orders/assign-line", { method: "POST", body: JSON.stringify(body) });
}

function get(path: string) {
  return new Request(`http://localhost${path}`);
}

const baseStore = (): Store => ({
  work_orders: [{ id: "wo-a", custom_id: "RO100", shop_id: "shop-a", customer_id: "cust-a", vehicle_id: "veh-a" }, { id: "00000000-0000-0000-0000-000000000001", custom_id: "RO101", shop_id: "shop-a", customer_id: "cust-a", vehicle_id: "veh-a" }],
  work_order_lines: [{ id: "line-a", work_order_id: "wo-a", shop_id: "shop-a", line_type: "job", assigned_tech_id: null }, { id: "line-uuid", work_order_id: "00000000-0000-0000-0000-000000000001", shop_id: "shop-a", line_type: "job", assigned_tech_id: null }],
  profiles: [
    { id: "tech-a", full_name: "Tech A", role: "mechanic", shop_id: "shop-a" },
    { id: "tech-alias", full_name: "Alias Tech", role: "technician", shop_id: "shop-a" },
    { id: "tech-b", full_name: "Tech B", role: "mechanic", shop_id: "shop-b" },
  ],
  shop_members: [{ user_id: "owner-1", shop_id: "shop-a", role: "owner" }],
  work_order_line_technicians: [],
  customers: [{ id: "cust-a", shop_id: "shop-a", name: "Customer A" }],
  vehicles: [{ id: "veh-a", shop_id: "shop-a", make: "Ford" }],
});

describe("work order assignment regression", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("owner can assign mechanic and writes primary plus bridge row while ignoring client shop_id", async () => {
    const store = baseStore();
    const { operations } = setup(store);
    const { POST } = await import("../app/api/work-orders/assign-line/route");

    const res = await POST(post({ work_order_line_id: "line-a", tech_id: "tech-a", shop_id: "shop-b" }));

    expect(res.status).toBe(200);
    expect(store.work_order_lines[0].assigned_tech_id).toBe("tech-a");
    expect(store.work_order_line_technicians).toContainEqual(expect.objectContaining({ work_order_line_id: "line-a", technician_id: "tech-a" }));
    expect(operations.find((op) => op.table === "work_order_lines" && op.op === "update")?.filters).toMatchObject({ id: "line-a", shop_id: "shop-a" });
  });

  it("mechanic cannot assign through API", async () => {
    setup(baseStore(), { id: "mech-1", role: "mechanic", shop_id: "shop-a" });
    const { POST } = await import("../app/api/work-orders/assign-line/route");
    const res = await POST(post({ work_order_line_id: "line-a", tech_id: "tech-a" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "forbidden_assignment_role" });
  });

  it("cross-shop assignment is rejected unless owner/admin has authorized membership", async () => {
    const store = baseStore();
    store.work_orders[0].shop_id = "shop-b";
    store.work_order_lines[0].shop_id = "shop-b";
    setup(store);
    const { POST } = await import("../app/api/work-orders/assign-line/route");
    const res = await POST(post({ work_order_line_id: "line-a", tech_id: "tech-b" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "forbidden_shop" });
  });

  it("owner with shop_members access can assign into target shop when active shop differs and technician alias is accepted", async () => {
    const store = baseStore();
    store.work_orders[0].shop_id = "shop-b";
    store.work_order_lines[0].shop_id = "shop-b";
    store.profiles.push({ id: "tech-c", full_name: "Tech C", role: "technician", shop_id: "shop-b" });
    store.shop_members.push({ user_id: "owner-1", shop_id: "shop-b", role: "manager" });
    setup(store);
    const { POST } = await import("../app/api/work-orders/assign-line/route");
    const res = await POST(post({ work_order_line_id: "line-a", tech_id: "tech-c" }));
    expect(res.status).toBe(200);
    expect(store.work_order_lines[0].assigned_tech_id).toBe("tech-c");
  });
});

describe("assignables and detail API", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("assignables returns staff for target work order shop, not actor active shop", async () => {
    const store = baseStore();
    store.work_orders[0].shop_id = "shop-b";
    store.shop_members.push({ user_id: "owner-1", shop_id: "shop-b", role: "admin" });
    setup(store);
    const { GET } = await import("../app/api/assignables/route");
    const res = await GET(get("/api/assignables?work_order_id=wo-a"));
    const payload = await res.json();
    expect(res.status).toBe(200);
    expect(payload.data.map((row: Row) => row.id)).toEqual(["tech-b"]);
  });

  it("assignables rejects unauthorized target shop", async () => {
    const store = baseStore();
    store.work_orders[0].shop_id = "shop-b";
    setup(store);
    const { GET } = await import("../app/api/assignables/route");
    const res = await GET(get("/api/assignables?work_order_id=wo-a"));
    expect(res.status).toBe(403);
  });

  it("detail API loads work order, lines, customer, vehicle, and line techs separately by shop", async () => {
    const store = baseStore();
    store.work_order_line_technicians.push({ work_order_line_id: "line-uuid", technician_id: "tech-a" });
    setup(store);
    const { GET } = await import("../app/api/work-orders/[id]/detail/route");
    const res = await GET(get("/api/work-orders/00000000-0000-0000-0000-000000000001/detail"), { params: { id: "00000000-0000-0000-0000-000000000001" } });
    const payload = await res.json();
    expect(res.status).toBe(200);
    expect(payload.data.work_order.id).toBe("00000000-0000-0000-0000-000000000001");
    expect(payload.data.customer.id).toBe("cust-a");
    expect(payload.data.vehicle.id).toBe("veh-a");
    expect(payload.data.line_technicians).toHaveLength(1);
  });

  it("detail API does not crash when customer/vehicle are missing", async () => {
    const store = baseStore();
    store.customers = [];
    store.vehicles = [];
    setup(store);
    const { GET } = await import("../app/api/work-orders/[id]/detail/route");
    const res = await GET(get("/api/work-orders/00000000-0000-0000-0000-000000000001/detail"), { params: { id: "00000000-0000-0000-0000-000000000001" } });
    const payload = await res.json();
    expect(res.status).toBe(200);
    expect(payload.data.customer).toBeNull();
    expect(payload.data.vehicle).toBeNull();
  });
});
