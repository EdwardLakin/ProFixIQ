import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdminSupabase: vi.fn(),
  listAssignedWorkOrderIds: vi.fn(),
  listInvoiceHistory: vi.fn(),
  requireAccess: vi.fn(),
}));

vi.mock("@/features/mobile/service/server/access", () => ({
  listFieldOperatorAssignedWorkOrderIds: mocks.listAssignedWorkOrderIds,
  requireMobileServiceOperatorApiAccess: mocks.requireAccess,
}));

vi.mock("@/features/mobile/service/server/fieldInvoiceHistory", () => ({
  listFieldInvoiceHistory: mocks.listInvoiceHistory,
}));

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: mocks.createAdminSupabase,
}));

import { GET } from "../app/api/mobile/service/invoices/route";

const adminClient = { kind: "admin" };

function allowedAccess(managementRole: boolean) {
  return {
    ok: true,
    actor: { canManageWorkOrders: true },
    profile: { id: "profile-1", shop_id: "shop-1", role: "lead_hand" },
    managementRole,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createAdminSupabase.mockReturnValue(adminClient);
  mocks.listAssignedWorkOrderIds.mockResolvedValue(["work-order-1"]);
  mocks.listInvoiceHistory.mockResolvedValue([]);
  mocks.requireAccess.mockResolvedValue(allowedAccess(false));
});

describe("Field invoice history route", () => {
  it("derives assigned scope before using the admin client", async () => {
    await GET();

    expect(mocks.listAssignedWorkOrderIds).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: expect.objectContaining({ id: "profile-1" }),
      }),
    );
    expect(
      mocks.listAssignedWorkOrderIds.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.createAdminSupabase.mock.invocationCallOrder[0]);
    expect(mocks.listInvoiceHistory).toHaveBeenCalledWith({
      supabase: adminClient,
      shopId: "shop-1",
      scope: { kind: "work_orders", ids: ["work-order-1"] },
    });
  });

  it("returns no rows without constructing an admin client when no work is assigned", async () => {
    mocks.listAssignedWorkOrderIds.mockResolvedValueOnce([]);

    const response = await GET();

    await expect(response.json()).resolves.toEqual({ ok: true, rows: [] });
    expect(mocks.createAdminSupabase).not.toHaveBeenCalled();
    expect(mocks.listInvoiceHistory).not.toHaveBeenCalled();
  });

  it("keeps billing operators on explicit shop scope", async () => {
    mocks.requireAccess.mockResolvedValueOnce(allowedAccess(true));

    await GET();

    expect(mocks.listAssignedWorkOrderIds).not.toHaveBeenCalled();
    expect(mocks.listInvoiceHistory).toHaveBeenCalledWith({
      supabase: adminClient,
      shopId: "shop-1",
      scope: { kind: "shop" },
    });
  });

  it("fails closed when assigned scope cannot be verified", async () => {
    mocks.listAssignedWorkOrderIds.mockRejectedValueOnce(
      new Error("assignment lookup failed"),
    );
    const error = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const response = await GET();

    expect(response.status).toBe(500);
    expect(mocks.createAdminSupabase).not.toHaveBeenCalled();
    expect(mocks.listInvoiceHistory).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it("rejects actors without the work-order capability before any invoice read", async () => {
    mocks.requireAccess.mockResolvedValueOnce({
      ...allowedAccess(false),
      actor: { canManageWorkOrders: false },
    });

    const response = await GET();

    expect(response.status).toBe(403);
    expect(mocks.listAssignedWorkOrderIds).not.toHaveBeenCalled();
    expect(mocks.createAdminSupabase).not.toHaveBeenCalled();
  });
});
