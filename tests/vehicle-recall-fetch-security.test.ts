import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchNhtsaRecalls,
  toVehicleRecallRows,
} from "@/features/vehicles/server/recallFetch";
import { requestVehicleRecallEnrichment } from "@/features/vehicles/lib/requestRecallEnrichment";

const ACTOR_ID = "44000000-0000-4000-8000-000000000001";
const SHOP_ID = "a4100000-0000-4000-8000-000000000001";
const VEHICLE_ID = "a4300000-0000-4000-8000-000000000001";

const mocks = vi.hoisted(() => ({
  requireAccess: vi.fn(),
  createAdmin: vi.fn(),
  vehicleEq: vi.fn(),
  vehicleMaybeSingle: vi.fn(),
  rpc: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: mocks.requireAccess,
}));

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: mocks.createAdmin,
}));

function vehicleQuery() {
  const query = {
    select: vi.fn(),
    eq: mocks.vehicleEq,
    maybeSingle: mocks.vehicleMaybeSingle,
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

function request(body: Record<string, unknown>): Request {
  return new Request("https://profixiq.test/api/recalls/fetch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function nhtsaResponse(status = 200): Response {
  return new Response(
    JSON.stringify({
      results: [
        {
          NHTSACampaignNumber: "24V001000",
          Component: "AIR BAGS",
          Summary: "A test recall summary",
          Consequence: "A test consequence",
          Remedy: "A test remedy",
          Manufacturer: "Honda",
          ReportReceivedDate: "01/10/2024",
        },
      ],
    }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

describe("POST /api/recalls/fetch tenant boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const scopedVehicleQuery = vehicleQuery();
    mocks.requireAccess.mockResolvedValue({
      ok: true,
      profile: { id: ACTOR_ID, shop_id: SHOP_ID, role: "owner" },
      canonicalRole: "owner",
      supabase: { from: vi.fn(() => scopedVehicleQuery) },
    });
    mocks.vehicleMaybeSingle.mockResolvedValue({
      data: {
        id: VEHICLE_ID,
        shop_id: SHOP_ID,
        vin: "1HGCM82633A004352",
        year: 2003,
        make: "Honda",
        model: "Accord",
      },
      error: null,
    });
    mocks.rpc.mockResolvedValue({
      data: [{ allowed: true, retry_after_seconds: 0 }],
      error: null,
    });
    mocks.upsert.mockResolvedValue({ error: null });
    mocks.createAdmin.mockReturnValue({
      rpc: mocks.rpc,
      from: vi.fn(() => ({ upsert: mocks.upsert })),
    });
    vi.stubGlobal("fetch", vi.fn(async () => nhtsaResponse()));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("rejects an anonymous caller before privileged access", async () => {
    mocks.requireAccess.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "Not authenticated" }, { status: 401 }),
    });
    const { POST } = await import("@/app/api/recalls/fetch/route");

    const response = await POST(request({ vehicleId: VEHICLE_ID }));

    expect(response.status).toBe(401);
    expect(mocks.createAdmin).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns not found for a vehicle outside the actor shop", async () => {
    mocks.vehicleMaybeSingle.mockResolvedValue({ data: null, error: null });
    const { POST } = await import("@/app/api/recalls/fetch/route");

    const response = await POST(request({ vehicleId: VEHICLE_ID }));

    expect(response.status).toBe(404);
    expect(mocks.vehicleEq).toHaveBeenCalledWith("id", VEHICLE_ID);
    expect(mocks.vehicleEq).toHaveBeenCalledWith("shop_id", SHOP_ID);
    expect(mocks.createAdmin).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a malformed vehicle id", async () => {
    const { POST } = await import("@/app/api/recalls/fetch/route");

    const response = await POST(request({ vehicleId: "not-a-uuid" }));

    expect(response.status).toBe(400);
    expect(mocks.vehicleMaybeSingle).not.toHaveBeenCalled();
    expect(mocks.createAdmin).not.toHaveBeenCalled();
  });

  it("rejects an invalid saved VIN before privileged access", async () => {
    mocks.vehicleMaybeSingle.mockResolvedValue({
      data: {
        id: VEHICLE_ID,
        shop_id: SHOP_ID,
        vin: "INVALID",
        year: 2003,
        make: "Honda",
        model: "Accord",
      },
      error: null,
    });
    const { POST } = await import("@/app/api/recalls/fetch/route");

    const response = await POST(request({ vehicleId: VEHICLE_ID }));

    expect(response.status).toBe(422);
    expect(mocks.createAdmin).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("ignores forged identity and vehicle fields and writes only server-derived scope", async () => {
    const { POST } = await import("@/app/api/recalls/fetch/route");

    const response = await POST(
      request({
        vehicleId: VEHICLE_ID,
        user_id: "45000000-0000-4000-8000-000000000002",
        shop_id: "b4200000-0000-4000-8000-000000000002",
        vin: "1FD0W5HT4FED33898",
        year: 2024,
        make: "Forged",
        model: "Vehicle",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("consume_vehicle_recall_fetch_quota", {
      p_actor_id: ACTOR_ID,
      p_shop_id: SHOP_ID,
      p_vehicle_id: VEHICLE_ID,
    });
    expect(mocks.upsert).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          campaign_number: "24V001000",
          shop_id: SHOP_ID,
          user_id: ACTOR_ID,
          vehicle_id: VEHICLE_ID,
          vin: "1HGCM82633A004352",
        }),
      ],
      { onConflict: "shop_id,vehicle_id,campaign_number" },
    );
  });

  it("enforces the distributed quota before calling NHTSA", async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ allowed: false, retry_after_seconds: 37 }],
      error: null,
    });
    const { POST } = await import("@/app/api/recalls/fetch/route");

    const response = await POST(request({ vehicleId: VEHICLE_ID }));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("37");
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("uses a stable tenant-safe conflict key on repeated requests", async () => {
    const { POST } = await import("@/app/api/recalls/fetch/route");

    const first = await POST(request({ vehicleId: VEHICLE_ID }));
    const second = await POST(request({ vehicleId: VEHICLE_ID }));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledTimes(2);
    expect(mocks.upsert.mock.calls[0]).toEqual(mocks.upsert.mock.calls[1]);
  });
});

describe("NHTSA recall fetch resilience", () => {
  it("retries a retryable response once and then succeeds", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(nhtsaResponse());
    const sleep = vi.fn(async () => undefined);

    const recalls = await fetchNhtsaRecalls(
      { year: 2003, make: "Honda", model: "Accord" },
      { fetcher, sleep },
    );

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(recalls).toHaveLength(1);
  });

  it("does not retry a non-retryable provider error", async () => {
    const fetcher = vi.fn(async () => new Response("bad request", { status: 400 }));

    await expect(
      fetchNhtsaRecalls(
        { year: 2003, make: "Honda", model: "Accord" },
        { fetcher, sleep: vi.fn(async () => undefined) },
      ),
    ).rejects.toMatchObject({ kind: "upstream" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("bounds timeout retries to two attempts", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    const fetcher = vi.fn(async () => {
      throw abortError;
    });

    await expect(
      fetchNhtsaRecalls(
        { year: 2003, make: "Honda", model: "Accord" },
        { fetcher, sleep: vi.fn(async () => undefined), timeoutMs: 1 },
      ),
    ).rejects.toMatchObject({ kind: "timeout" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("deduplicates campaign rows and skips records without a campaign number", () => {
    const rows = toVehicleRecallRows(
      [
        { NHTSACampaignNumber: "24V001000", Summary: "old" },
        { NHTSACampaignNumber: "24v001000", Summary: "new" },
        { Summary: "missing campaign" },
      ],
      {
        actorId: ACTOR_ID,
        shopId: SHOP_ID,
        vehicleId: VEHICLE_ID,
        vin: "1HGCM82633A004352",
        year: 2003,
        make: "Honda",
        model: "Accord",
      },
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      campaign_number: "24V001000",
      summary: "new",
      shop_id: SHOP_ID,
      vehicle_id: VEHICLE_ID,
    });
  });
});

describe("saved vehicle recall trigger", () => {
  it("sends only the saved vehicle id", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 200 }));

    await expect(requestVehicleRecallEnrichment(VEHICLE_ID, fetcher)).resolves.toBe(true);

    expect(fetcher).toHaveBeenCalledWith("/api/recalls/fetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vehicleId: VEHICLE_ID }),
      keepalive: true,
    });
  });

  it("queues enrichment only after desktop or mobile persistence", () => {
    const modalSource = readFileSync("app/vehicle/VinCaptureModal.tsx", "utf8");
    const desktopSource = readFileSync(
      "features/work-orders/app/work-orders/create/page.tsx",
      "utf8",
    );
    const mobileSource = readFileSync(
      "app/mobile/work-orders/create/page.tsx",
      "utf8",
    );

    expect(modalSource).not.toContain('/api/recalls/fetch');
    expect(desktopSource).toContain("requestVehicleRecallEnrichment(veh.id)");
    expect(mobileSource).toContain("requestVehicleRecallEnrichment(veh.id)");
  });
});
