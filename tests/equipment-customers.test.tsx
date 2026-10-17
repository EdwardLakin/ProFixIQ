import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { equipmentCustomers } from "@/features/equipment/lib/equipmentCustomers";
import {
  parseDirectoryFilters,
  type EquipmentIdentityRow,
} from "@/features/equipment/lib/equipmentDirectoryQuery";
import EquipmentCustomersView from "@/features/equipment/components/EquipmentCustomersView";

const mocks = vi.hoisted(() => ({
  role: "owner",
  entitlement: "enabled",
  load: vi.fn(),
  admin: vi.fn(() => ({ admin: true })),
}));
vi.mock("next/cache", () => ({ unstable_noStore: vi.fn() }));
vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopPageAccess: async ({ allowRoles }: { allowRoles: string[] }) => {
    if (!allowRoles.includes(mocks.role)) throw new Error("denied");
    return {
      profile: { shop_id: "authenticated-shop" },
      canonicalRole: mocks.role,
    };
  },
}));
vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: mocks.admin,
  createServerSupabaseRSC: () => ({ session: true }),
}));
vi.mock("@/features/equipment/server/pageEntitlement", () => ({
  resolveEquipmentPageEntitlement: async () => mocks.entitlement,
}));
vi.mock("@/features/equipment/server/loadEquipmentAssetList", () => ({
  loadEquipmentAssetList: mocks.load,
}));
import Page from "../app/equipment/customers/page";

const asset = (
  patch: Partial<EquipmentIdentityRow> = {},
): EquipmentIdentityRow => ({
  assetId: "asset-1",
  updatedAt: "2026-10-17",
  unitNumber: "EX-12",
  year: 2024,
  make: "CAT",
  model: "320",
  serialNumber: "SERIAL-12",
  equipmentClass: "excavator",
  equipmentClassLabel: "Excavator",
  customerId: "customer-1",
  customerName: "North Yard",
  siteName: "North pit",
  operatingStatus: "operational",
  ...patch,
});
const page = (params = {}) => Page({ searchParams: Promise.resolve(params) });
beforeEach(() => {
  mocks.role = "owner";
  mocks.entitlement = "enabled";
  mocks.admin.mockClear();
  mocks.load.mockReset().mockResolvedValue({ rows: [asset()], capped: false });
});
afterEach(cleanup);

describe("Equipment customer projection", () => {
  it("groups canonical customer IDs, excludes hidden/unlinked accounts and deduplicates assets", () => {
    const rows = equipmentCustomers([
      asset(),
      asset(),
      asset({ assetId: "asset-2" }),
      asset({ assetId: "hidden", customerName: null }),
      asset({ assetId: "unlinked", customerId: null }),
      asset({ assetId: "other", customerId: "customer-2" }),
    ]);
    expect(rows.map((row) => [row.id, row.assets.length])).toEqual([
      ["customer-1", 2],
      ["customer-2", 1],
    ]);
  });
  it("searches and counts before paginating customers, not asset rows", () => {
    const customers = equipmentCustomers(
      Array.from({ length: 55 }, (_, i) =>
        asset({
          assetId: `asset-${i}`,
          customerId: `customer-${i}`,
          customerName: `Customer ${String(i).padStart(2, "0")}`,
        }),
      ),
    );
    render(
      <EquipmentCustomersView
        customers={customers}
        filters={parseDirectoryFilters({ page: "2" })}
        canOpenAccount={false}
      />,
    );
    expect(screen.getByText("55 customers")).toBeTruthy();
    expect(screen.queryByText("Customer 00")).toBeNull();
    expect(screen.getByText("Customer 54")).toBeTruthy();
    cleanup();
    render(
      <EquipmentCustomersView
        customers={customers}
        filters={parseDirectoryFilters({ q: "54", page: "2" })}
        canOpenAccount={false}
      />,
    );
    expect(screen.getByText("1 customers")).toBeTruthy();
    expect(screen.getByText("Customer 54")).toBeTruthy();
  });
});
describe("Equipment Customers access and UI", () => {
  it("uses authenticated scope and the existing identity loader", async () => {
    await page({ shop_id: "attacker-shop" });
    expect(mocks.load).toHaveBeenCalledWith({
      shopId: "authenticated-shop",
      supabase: { session: true },
      admin: { admin: true },
    });
  });
  it.each(["mechanic", "customer", "fleet_manager", "unknown"])(
    "denies %s before data reads",
    async (role) => {
      mocks.role = role;
      await expect(page()).rejects.toThrow("denied");
      expect(mocks.load).not.toHaveBeenCalled();
      expect(mocks.admin).not.toHaveBeenCalled();
    },
  );
  it.each(["disabled", "error"])(
    "fails closed on %s entitlement",
    async (state) => {
      mocks.entitlement = state;
      expect((await page()).props.state).toBe(state);
      expect(mocks.load).not.toHaveBeenCalled();
      expect(mocks.admin).not.toHaveBeenCalled();
    },
  );
  it.each(["parts", "service", "lead_hand", "foreman"])(
    "preserves account restrictions for %s",
    async (role) => {
      mocks.role = role;
      render(await page({ customer: "customer-1" }));
      expect(
        screen.getByRole("link", { name: /EX-12/ }).getAttribute("href"),
      ).toBe("/equipment/asset-1");
      expect(
        screen.queryByRole("link", { name: /shared customer account/ }),
      ).toBeNull();
      expect(screen.getByText("SERIAL-12")).toBeTruthy();
    },
  );
  it.each(["owner", "admin", "manager", "advisor"])(
    "offers existing account handoff for %s",
    async (role) => {
      mocks.role = role;
      render(await page({ customer: "customer-1" }));
      expect(
        screen
          .getByRole("link", { name: /Open shared customer account/ })
          .getAttribute("href"),
      ).toBe("/customers/customer-1");
      expect(screen.getByText(/includes all of this customer/)).toBeTruthy();
    },
  );
  it("does not reveal or link an unknown or cross-tenant customer", async () => {
    render(await page({ customer: "other-shop-customer" }));
    expect(
      screen.getByText(/not available in the loaded Equipment/),
    ).toBeTruthy();
    expect(screen.queryByText("North Yard")).toBeNull();
    expect(
      screen.queryByRole("link", { name: /Open shared customer account/ }),
    ).toBeNull();
  });
  it("discloses partial scans on directory and detail", async () => {
    mocks.load.mockResolvedValue({ rows: [asset()], capped: true });
    render(await page());
    expect(screen.getByRole("status").textContent).toContain(
      "may be incomplete",
    );
    expect(screen.getByText("1 customers in loaded results")).toBeTruthy();
    cleanup();
    render(await page({ customer: "customer-1" }));
    expect(screen.getByRole("heading", { level: 2 }).textContent).toContain(
      "in loaded results",
    );
  });
  it("distinguishes failed reads from empty results without exposing error details", async () => {
    mocks.load.mockRejectedValue(new Error("private db error"));
    render(await page());
    expect(screen.getByRole("alert").textContent).toContain(
      "could not be loaded",
    );
    expect(screen.queryByText(/private db error|0 customers/)).toBeNull();
  });
});
