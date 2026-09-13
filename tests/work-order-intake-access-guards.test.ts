import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const SHOP_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_SHOP_ID = "99999999-9999-4999-8999-999999999999";
const CUSTOMER_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_CUSTOMER_ID = "88888888-8888-4888-8888-888888888888";
const VEHICLE_ID = "33333333-3333-4333-8333-333333333333";
const PROFILE_ID = "44444444-4444-4444-8444-444444444444";

const mocks = vi.hoisted(() => ({
  requireShopScopedApiAccess: vi.fn(),
  requirePortalCustomerActor: vi.fn(),
}));

vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopScopedApiAccess: mocks.requireShopScopedApiAccess,
}));

vi.mock("@/features/portal/server/requirePortalActor", () => ({
  requirePortalCustomerActor: mocks.requirePortalCustomerActor,
}));

import {
  authorizeIntakeAccess,
  verifyIntakeSubjectScope,
} from "../app/api/work-orders/[id]/intake/route";
import { PortalAccessError } from "../features/portal/server/portalAuth";
import { makeIntakeDefaults } from "../features/work-orders/intake/defaults";
import { readFileSync } from "node:fs";

function workOrder(overrides: Partial<{
  id: string;
  shop_id: string;
  customer_id: string | null;
  vehicle_id: string | null;
}> = {}) {
  return {
    id: "wo-1",
    shop_id: SHOP_ID,
    customer_id: CUSTOMER_ID,
    vehicle_id: VEHICLE_ID,
    ...overrides,
  };
}

function fakeSupabase(vehicleLookup: unknown = null) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: vehicleLookup, error: null })),
        })),
      })),
    })),
  } as unknown as Parameters<typeof verifyIntakeSubjectScope>[0]["supabase"];
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("authorizeIntakeAccess", () => {
  it("rejects app mode when the caller's shop does not match the work order's shop", async () => {
    mocks.requireShopScopedApiAccess.mockResolvedValueOnce({
      ok: true,
      profile: { id: PROFILE_ID, shop_id: OTHER_SHOP_ID },
      supabase: {},
    });

    const result = await authorizeIntakeAccess({
      mode: "app",
      workOrder: workOrder(),
      fallbackSupabase: fakeSupabase(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("rejects app mode outright when the role/shop lookup itself fails", async () => {
    mocks.requireShopScopedApiAccess.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    });

    const result = await authorizeIntakeAccess({
      mode: "app",
      workOrder: workOrder(),
      fallbackSupabase: fakeSupabase(),
    });

    expect(result.ok).toBe(false);
    expect(mocks.requireShopScopedApiAccess).toHaveBeenCalled();
  });

  it("allows app mode when the caller's shop matches", async () => {
    mocks.requireShopScopedApiAccess.mockResolvedValueOnce({
      ok: true,
      profile: { id: PROFILE_ID, shop_id: SHOP_ID },
      supabase: {},
    });

    const result = await authorizeIntakeAccess({
      mode: "app",
      workOrder: workOrder(),
      fallbackSupabase: fakeSupabase(),
    });

    expect(result.ok).toBe(true);
  });

  it("rejects portal mode when the authenticated portal customer does not own the work order", async () => {
    mocks.requirePortalCustomerActor.mockResolvedValueOnce({
      userId: "auth-user-1",
      customer: { id: OTHER_CUSTOMER_ID },
    });

    const result = await authorizeIntakeAccess({
      mode: "portal",
      workOrder: workOrder(),
      fallbackSupabase: fakeSupabase(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it("allows portal mode when the authenticated portal customer owns the work order", async () => {
    mocks.requirePortalCustomerActor.mockResolvedValueOnce({
      userId: "auth-user-1",
      customer: { id: CUSTOMER_ID },
    });

    const result = await authorizeIntakeAccess({
      mode: "portal",
      workOrder: workOrder(),
      fallbackSupabase: fakeSupabase(),
    });

    expect(result.ok).toBe(true);
  });

  it("maps a PortalAccessError to its own status instead of a generic 403", async () => {
    mocks.requirePortalCustomerActor.mockRejectedValueOnce(
      new PortalAccessError("No active invite.", 401),
    );

    const result = await authorizeIntakeAccess({
      mode: "portal",
      workOrder: workOrder(),
      fallbackSupabase: fakeSupabase(),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });
});

describe("verifyIntakeSubjectScope", () => {
  it("rejects an intake that tries to move the work order to a different customer", async () => {
    const intake = makeIntakeDefaults({
      customer_id: OTHER_CUSTOMER_ID,
      vehicle_id: VEHICLE_ID,
    });
    intake.concern.primary_text = "Brake noise";

    const response = await verifyIntakeSubjectScope({
      supabase: fakeSupabase(),
      workOrder: workOrder(),
      intake,
    });

    expect(response).not.toBeNull();
    expect(response?.status).toBe(403);
  });

  it("rejects a vehicle that does not belong to the work order's customer", async () => {
    const intake = makeIntakeDefaults({
      customer_id: CUSTOMER_ID,
      vehicle_id: VEHICLE_ID,
    });
    intake.concern.primary_text = "Brake noise";

    const response = await verifyIntakeSubjectScope({
      supabase: fakeSupabase({ id: VEHICLE_ID, customer_id: OTHER_CUSTOMER_ID }),
      workOrder: workOrder(),
      intake,
    });

    expect(response).not.toBeNull();
    expect(response?.status).toBe(403);
  });

  it("allows an intake whose customer and vehicle both match the work order", async () => {
    const intake = makeIntakeDefaults({
      customer_id: CUSTOMER_ID,
      vehicle_id: VEHICLE_ID,
    });
    intake.concern.primary_text = "Brake noise";

    const response = await verifyIntakeSubjectScope({
      supabase: fakeSupabase({ id: VEHICLE_ID, customer_id: CUSTOMER_ID }),
      workOrder: workOrder(),
      intake,
    });

    expect(response).toBeNull();
  });
});

describe("route wiring", () => {
  const routeSource = readFileSync(
    "app/api/work-orders/[id]/intake/route.ts",
    "utf8",
  );

  it("gates every method through the shared access and subject-scope guards", () => {
    const [getBody, putBody, postBody] = [
      routeSource.slice(
        routeSource.indexOf("export async function GET"),
        routeSource.indexOf("export async function PUT"),
      ),
      routeSource.slice(
        routeSource.indexOf("export async function PUT"),
        routeSource.indexOf("export async function POST"),
      ),
      routeSource.slice(routeSource.indexOf("export async function POST")),
    ];

    expect(getBody).toContain("await authorizeIntakeAccess(");
    expect(putBody).toContain("await authorizeIntakeAccess(");
    expect(postBody).toContain("await authorizeIntakeAccess(");

    expect(putBody).toContain("await verifyIntakeSubjectScope(");
    expect(postBody).toContain("await verifyIntakeSubjectScope(");
  });

  it("reports both response field names line-generation callers rely on", () => {
    expect(routeSource).toContain("inserted: linesToInsert.length");
    expect(routeSource).toContain("createdLines: linesToInsert.length");
  });
});
