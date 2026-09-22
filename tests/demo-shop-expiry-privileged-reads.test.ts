import { beforeEach, describe, expect, it, vi } from "vitest";

// Codex review on PR 1720 found that requireShopScopedApiAccess()/
// requireShopPageAccess() are not the only paths into privileged data: a
// handful of call sites resolve the staff profile directly via
// resolveAuthenticatedStaffProfile() and then read through a service-role
// client that bypasses RLS entirely, without ever going through either gate.
// An expired demo profile passed straight through those call sites. This
// file covers the fix: the same isDemoAccessExpired() check added directly
// to each of them.

const resolveCanonicalStaffProfileMock = vi.hoisted(() => vi.fn());
const createAdminSupabaseMock = vi.hoisted(() => vi.fn());
const createServerSupabaseRouteMock = vi.hoisted(() => vi.fn());
const createServerSupabaseRSCMock = vi.hoisted(() => vi.fn());

vi.mock("@/features/shared/lib/authenticated-profile", () => ({
  resolveCanonicalStaffProfile: resolveCanonicalStaffProfileMock,
}));

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: createAdminSupabaseMock,
  createServerSupabaseRoute: createServerSupabaseRouteMock,
  createServerSupabaseRSC: createServerSupabaseRSCMock,
}));

const AUTH_USER_ID = "11111111-1111-4111-8111-111111111111";
const PROFILE_ID = "22222222-2222-4222-8222-222222222222";
const SHOP_ID = "33333333-3333-4333-8333-333333333333";

function mockProfile(role: string, demoAccessExpiresAt: string | null) {
  resolveCanonicalStaffProfileMock.mockResolvedValue({
    profile: {
      id: PROFILE_ID,
      user_id: AUTH_USER_ID,
      shop_id: SHOP_ID,
      role,
      demo_access_expires_at: demoAccessExpiresAt,
    },
    error: null,
  });
}

const PAST = new Date(Date.now() - 60 * 60 * 1000).toISOString();

function fakeAuthedSupabase() {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: AUTH_USER_ID } },
        error: null,
      }),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("app/api/offline/technician-work-orders (service-role reads)", () => {
  it("rejects an expired demo profile before any privileged read", async () => {
    createServerSupabaseRouteMock.mockReturnValue(fakeAuthedSupabase());
    mockProfile("mechanic", PAST);

    const { GET } = await import(
      "../app/api/offline/technician-work-orders/route"
    );
    const response = await GET();

    expect(response.status).toBe(403);
    expect(createAdminSupabaseMock).not.toHaveBeenCalled();
  });

  it("does not block on expiry for a normal (non-demo) profile", async () => {
    createServerSupabaseRouteMock.mockReturnValue(fakeAuthedSupabase());
    // "parts" cannot perform assigned work, so a non-expiry rejection here
    // proves the expiry check let it through and it failed on role instead.
    mockProfile("parts", null);

    const { GET } = await import(
      "../app/api/offline/technician-work-orders/route"
    );
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe(
      "Assigned technician work is not available for this role.",
    );
  });
});

describe("approval-decision route, staff surface (service-role reads)", () => {
  async function callRoute(role: string, demoAccessExpiresAt: string | null) {
    createServerSupabaseRouteMock.mockReturnValue(fakeAuthedSupabase());
    mockProfile(role, demoAccessExpiresAt);

    const { POST } = await import(
      "../app/api/work-orders/lines/[id]/approval-decision/route"
    );
    const req = new Request("http://localhost/api/work-orders/lines/x", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        workOrderId: "wo-1",
        decision: "approve",
        actorSurface: "staff",
      }),
    });
    return POST(req as never, { params: Promise.resolve({ id: "line-1" }) });
  }

  it("rejects an expired demo staff profile before any privileged read", async () => {
    const response = await callRoute("mechanic", PAST);
    expect(response.status).toBe(403);
    expect(createAdminSupabaseMock).not.toHaveBeenCalled();
  });

  it("does not block on expiry for a normal (non-demo) profile", async () => {
    // "parts" cannot authorize quotes, so a non-expiry rejection here proves
    // the expiry check let it through and it failed on role instead.
    const response = await callRoute("parts", null);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("This staff role cannot record approval decisions.");
  });
});

describe("requireShopAssistantActor (service-role fleet-membership read)", () => {
  it("rejects an expired demo profile before any privileged read", async () => {
    mockProfile("owner", PAST);

    const { requireShopAssistantActor, ShopAssistantHttpError } =
      await import("@/features/shop-assistant/server/requireShopAssistantActor");

    await expect(
      requireShopAssistantActor(fakeAuthedSupabase() as never),
    ).rejects.toMatchObject(
      new ShopAssistantHttpError(403, "Forbidden"),
    );
    expect(createAdminSupabaseMock).not.toHaveBeenCalled();
  });

  it("does not block on expiry for a normal (non-demo) profile", async () => {
    // "customer" fails canAccessShopAssistant, so a non-expiry rejection
    // here proves the expiry check let it through and it failed on role
    // instead, before ever reaching the fleet-membership admin read.
    mockProfile("customer", null);

    const { requireShopAssistantActor, ShopAssistantHttpError } =
      await import("@/features/shop-assistant/server/requireShopAssistantActor");

    await expect(
      requireShopAssistantActor(fakeAuthedSupabase() as never),
    ).rejects.toMatchObject(
      new ShopAssistantHttpError(
        403,
        "Your role does not have access to the shop-wide assistant",
      ),
    );
  });
});

describe("applyJobPunchTransition (service-role punch mutation)", () => {
  async function callTransition(role: string, demoAccessExpiresAt: string | null) {
    mockProfile(role, demoAccessExpiresAt);

    const { applyJobPunchTransition } = await import(
      "@/features/work-orders/server/applyJobPunchTransition"
    );
    return applyJobPunchTransition({
      supabase: fakeAuthedSupabase() as never,
      lineId: "line-1",
      action: "start",
      technicianId: PROFILE_ID,
      options: { operationKey: "op-1", enforceAssignedWork: true },
    });
  }

  it("rejects an expired demo profile before any privileged read", async () => {
    const result = await callTransition("mechanic", PAST);

    expect(result).toEqual({ ok: false, status: 403, error: "Forbidden" });
    expect(createAdminSupabaseMock).not.toHaveBeenCalled();
  });

  it("does not block on expiry for a normal (non-demo) profile", async () => {
    // "parts" cannot perform assigned work, so a non-expiry rejection here
    // proves the expiry check let it through and it failed on role instead.
    const result = await callTransition("parts", null);

    expect(result).toEqual({
      ok: false,
      status: 403,
      error: "This staff role is not permitted to perform assigned work.",
    });
  });
});

describe("loadCurrentWorkOrderWorkspaceSnapshot (service-role workspace read)", () => {
  async function callLoader(role: string, demoAccessExpiresAt: string | null) {
    createServerSupabaseRSCMock.mockReturnValue(fakeAuthedSupabase());
    mockProfile(role, demoAccessExpiresAt);

    const { loadCurrentWorkOrderWorkspaceSnapshot } = await import(
      "@/features/work-orders/workspace/server/loadWorkOrderWorkspaceSnapshot"
    );
    return loadCurrentWorkOrderWorkspaceSnapshot({ routeId: "wo-1" });
  }

  it("returns null for an expired demo profile without reading via the admin client", async () => {
    const result = await callLoader("owner", PAST);

    expect(result).toBeNull();
    expect(createAdminSupabaseMock).not.toHaveBeenCalled();
  });

  it("does not block on expiry for a normal (non-demo) profile", async () => {
    // Mocking createAdminSupabase to a stub that throws is enough: reaching
    // it at all proves the expiry check did not short-circuit first. (The
    // throw surfaces as a rejection here rather than the function's own
    // null fallback, since its try/catch returns the inner call's promise
    // without awaiting it — a pre-existing quirk, not something this test
    // needs to work around beyond expecting the rejection.)
    createAdminSupabaseMock.mockReturnValue({
      from: () => {
        throw new Error("stop here — admin client was reached as expected");
      },
    });

    await expect(callLoader("owner", null)).rejects.toThrow(
      "stop here — admin client was reached as expected",
    );
    expect(createAdminSupabaseMock).toHaveBeenCalled();
  });
});
