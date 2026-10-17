import { render, screen, cleanup } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ROLE_GROUPS } from "@/features/shared/lib/rbac";
const mocks = vi.hoisted(() => ({
  role: "owner",
  entitlement: "enabled",
  asset: vi.fn(),
  vehicle: vi.fn(),
  workspace: vi.fn(),
  handoff: vi.fn(),
  create: vi.fn(),
  detail: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("404");
  },
}));
vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopPageAccess: async ({ allowRoles }: { allowRoles: string[] }) => {
    if (!allowRoles.includes(mocks.role)) throw new Error("Denied");
    return { profile: { shop_id: "shop" }, canonicalRole: mocks.role };
  },
}));
vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: () => ({}),
  createServerSupabaseRSC: () => ({}),
}));
vi.mock("@/features/equipment/server/pageEntitlement", () => ({
  resolveEquipmentPageEntitlement: async () => mocks.entitlement,
}));
vi.mock("@/features/equipment/server/equipmentAssetProfileService", () => ({
  loadEquipmentAssetRecord: mocks.asset,
}));
vi.mock("@/features/vehicles/server/loadVehicleWorkspaceSnapshot", () => ({
  loadVehicleWorkspaceSnapshot: mocks.vehicle,
  vehicleWorkspaceCreateWorkOrderHref: mocks.handoff,
}));
vi.mock(
  "@/features/work-orders/workspace/server/loadWorkOrderWorkspaceSnapshot",
  async (importOriginal) => ({ ...(await importOriginal<typeof import("@/features/work-orders/workspace/server/loadWorkOrderWorkspaceSnapshot")>()), loadCurrentWorkOrderWorkspaceSnapshot: mocks.workspace }),
);
vi.mock(
  "@/features/work-orders/app/work-orders/create/ShopCreateWorkOrderPage",
  () => ({
    default: (props: unknown) => {
      mocks.create(props);
      return <p>Canonical creation</p>;
    },
  }),
);
vi.mock("../app/work-orders/[id]/Client", () => ({
  default: (props: unknown) => {
    mocks.detail(props);
    return <p>Canonical workspace</p>;
  },
}));
vi.mock("@/features/equipment/components/EquipmentWorkOrderProviders", () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock("@/features/work-orders/workspace/WorkOrderWorkspaceFrame", () => ({
  WorkOrderWorkspaceFrame: ({ children }: { children: React.ReactNode }) =>
    children,
}));
vi.mock(
  "@/features/operations/components/WorkOrderOperationalTimelineDock",
  () => ({ default: () => null }),
);
import CreatePage from "../app/equipment/work-orders/create/[assetId]/page";
import DetailPage from "../app/equipment/work-orders/[id]/page";
const assetId = "00000000-0000-4000-8000-000000000001";
const create = () => CreatePage({ params: Promise.resolve({ assetId }) });
const detail = () => DetailPage({ params: Promise.resolve({ id: "wo" }) });
beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.role = "owner";
  mocks.entitlement = "enabled";
  mocks.asset.mockResolvedValue({
    profile: {},
    asset: { id: assetId, customerId: "customer" },
  });
  mocks.vehicle.mockResolvedValue({ currentAccount: { id: "customer" } });
  mocks.handoff.mockReturnValue("/work-orders/create?customerId=customer");
  mocks.workspace.mockResolvedValue({
    workOrder: { id: "wo", shopId: "shop", vehicleId: assetId },
    resource: {},
  });
});
describe("Equipment native work routes", () => {
  it.each(ROLE_GROUPS.workOrderCreators)(
    "preserves creator role %s and passes server-resolved identity to the canonical engine",
    async (role) => {
      mocks.role = role;
      render(await create());
      expect(mocks.asset).toHaveBeenCalledWith(
        expect.objectContaining({ shopId: "shop", assetId, role }),
      );
      expect(mocks.create).toHaveBeenCalledWith({
        equipmentContext: { shopId: "shop", assetId, customerId: "customer" },
      });
    },
  );
  it.each(["mechanic", "parts", "customer", "driver"])(
    "denies creation to %s before asset reads",
    async (role) => {
      mocks.role = role;
      await expect(create()).rejects.toThrow("Denied");
      expect(mocks.asset).not.toHaveBeenCalled();
    },
  );
  it("fails closed for unavailable entitlement", async () => {
    mocks.entitlement = "disabled";
    await create();
    await detail();
    expect(mocks.asset).not.toHaveBeenCalled();
    expect(mocks.workspace).not.toHaveBeenCalled();
  });
  it("rejects missing/cross-tenant assets and ordinary vehicles", async () => {
    mocks.asset.mockResolvedValue(null);
    await expect(create()).rejects.toThrow("404");
    mocks.asset.mockResolvedValue({ profile: null });
    await expect(create()).rejects.toThrow("404");
  });
  it("preserves canonical creation eligibility and requires a linked customer", async () => {
    mocks.handoff.mockReturnValue(null);
    await expect(create()).rejects.toThrow("404");
    mocks.vehicle.mockResolvedValue({ currentAccount: null });
    await expect(create()).rejects.toThrow("404");
  });
  it("composes the internal workspace and preserves explicit approval and deterministic return links", async () => {
    render(await detail());
    expect(mocks.detail).toHaveBeenCalledWith({ equipment: true });
    expect(
      screen.getByRole("link", { name: "Back to Equipment Work" }),
    ).toHaveAttribute("href", "/equipment/work-orders");
    expect(
      screen.getByRole("link", { name: "Equipment asset" }),
    ).toHaveAttribute("href", `/equipment/${assetId}`);
    expect(
      screen.getByRole("link", { name: "Customer approval" }),
    ).toHaveAttribute("href", "/work-orders/wo/approve");
  });
  it("rejects foreign work and non-Equipment work before rendering", async () => {
    mocks.workspace.mockResolvedValue({
      workOrder: { shopId: "foreign", vehicleId: assetId },
    });
    await expect(detail()).rejects.toThrow("404");
    expect(mocks.asset).not.toHaveBeenCalled();
    mocks.workspace.mockResolvedValue({
      workOrder: { shopId: "shop", vehicleId: assetId },
    });
    mocks.asset.mockResolvedValue({ profile: null });
    await expect(detail()).rejects.toThrow("404");
    expect(mocks.detail).not.toHaveBeenCalled();
  });
  it.each(ROLE_GROUPS.workOrderCreators)(
    "keeps the post-create workspace reachable for %s without broadening queue links",
    async (role) => {
      mocks.role = role;
      render(await detail());
      expect(screen.getByText("Canonical workspace")).toBeInTheDocument();
    },
  );
  it.each(["customer", "driver", "fleet_manager"])(
    "denies workspace access to %s",
    async (role) => {
      mocks.role = role;
      await expect(detail()).rejects.toThrow("Denied");
      expect(mocks.workspace).not.toHaveBeenCalled();
    },
  );
});
