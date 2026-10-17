import { beforeEach, expect, it, vi } from "vitest";
import {
  getActorCapabilities,
  type CanonicalRole,
} from "@/features/shared/lib/rbac";
import { emptyFleetSummary } from "@/features/equipment/lib/equipmentDashboard";
const mocks = vi.hoisted(() => ({
  role: "owner",
  entitlement: "enabled",
  summary: vi.fn(),
  counts: vi.fn(),
  field: vi.fn(),
  admin: vi.fn(() => ({})),
  window: {
    startsAt: "2026-10-17T00:00:00.000Z",
    endsAt: "2026-10-24T12:00:00.000Z",
  },
}));
vi.mock("next/cache", () => ({ unstable_noStore: vi.fn() }));
vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopPageAccess: async (options: {
    allowRoles: readonly string[];
    requiredCapability?: "canManageScheduling";
  }) => {
    if (
      !options.allowRoles.includes(mocks.role) ||
      (options.requiredCapability &&
        !getActorCapabilities({ role: mocks.role as CanonicalRole })[
          options.requiredCapability
        ])
    )
      throw new Error("Denied");
    return {
      profile: { id: "profile-not-auth-id", shop_id: "server-shop" },
      canonicalRole: mocks.role,
    };
  },
}));
vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: mocks.admin,
  createServerSupabaseRSC: () => ({}),
}));
vi.mock("@/features/equipment/server/pageEntitlement", () => ({
  resolveEquipmentPageEntitlement: async () => mocks.entitlement,
}));
vi.mock("@/features/equipment/server/loadEquipmentFleetSummary", () => ({
  loadEquipmentFleetSummary: mocks.summary,
}));
vi.mock("@/features/equipment/server/loadEquipmentOperationCounts", () => ({
  loadEquipmentOperationCounts: mocks.counts,
}));
vi.mock("@/features/equipment/server/loadEquipmentFieldVisits", () => ({
  loadEquipmentFieldVisits: mocks.field,
  equipmentVisitWindow: () => mocks.window,
  equipmentFieldVisitsHref: () => "/equipment/dashboard/field-visits?window",
  parseEquipmentVisitWindow: () => mocks.window,
}));
import Dashboard from "../app/equipment/dashboard/page";
import FieldPage from "../app/equipment/dashboard/field-visits/page";
beforeEach(() => {
  mocks.role = "owner";
  mocks.entitlement = "enabled";
  mocks.admin.mockClear();
  mocks.summary.mockReset().mockResolvedValue(emptyFleetSummary());
  mocks.counts
    .mockReset()
    .mockResolvedValue({
      approvals: {
        value: 2,
        partial: false,
        href: "/equipment/work-orders?kind=estimate&status=sent",
      },
      parts: {
        value: 1,
        partial: false,
        href: "/equipment/work-orders?stage=waiting_parts",
      },
    });
  mocks.field
    .mockReset()
    .mockResolvedValue({
      rows: [{ id: "visit" }],
      partial: false,
      window: mocks.window,
    });
});
it("derives tenant and canonical profile identity, passing count and drilldown scope through", async () => {
  const page = await Dashboard();
  expect(mocks.counts).toHaveBeenCalledWith(
    expect.objectContaining({ shopId: "server-shop", role: "owner" }),
  );
  expect(mocks.field).toHaveBeenCalledWith(
    expect.objectContaining({
      shopId: "server-shop",
      actorProfileId: "profile-not-auth-id",
      window: mocks.window,
    }),
  );
  expect(page.props.operations.props.operations.field.value).toBe(1);
  const list = await FieldPage({
    searchParams: Promise.resolve({ shopId: "foreign", page: "2" }),
  });
  expect(list.props.page).toBe(2);
  expect(mocks.field.mock.calls[1][0].shopId).toBe("server-shop");
});
it("keeps existing dashboard metrics when Dispatch is unavailable", async () => {
  mocks.field.mockRejectedValue(new Error("RPC unavailable"));
  const page = await Dashboard();
  expect(page.props.summary).toEqual(emptyFleetSummary());
  expect(page.props.operations.props.operations.field.value).toBeNull();
  expect(page.props.operations.props.operations.approvals.value).toBe(2);
});
it("never invokes Dispatch for a directory role without scheduling access", async () => {
  mocks.role = "service";
  const page = await Dashboard();
  expect(mocks.field).not.toHaveBeenCalled();
  expect(page.props.operations.props.operations.field.value).toBeNull();
  await expect(FieldPage({})).rejects.toThrow("Denied");
});
it.each(["mechanic", "customer", "driver"])(
  "denies %s before reads",
  async (role) => {
    mocks.role = role;
    await expect(Dashboard()).rejects.toThrow("Denied");
    await expect(FieldPage({})).rejects.toThrow("Denied");
    expect(mocks.admin).not.toHaveBeenCalled();
  },
);
it.each(["disabled", "error"])(
  "fails closed for entitlement %s",
  async (state) => {
    mocks.entitlement = state;
    expect((await Dashboard()).props.state).toBe(state);
    expect((await FieldPage({})).props.state).toBe(state);
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.counts).not.toHaveBeenCalled();
    expect(mocks.field).not.toHaveBeenCalled();
  },
);
