import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ROLE_GROUPS, type CanonicalRole } from "@/features/shared/lib/rbac";
import { parseDirectoryFilters } from "@/features/equipment/lib/equipmentDirectoryQuery";
import type { EquipmentDirectoryRow } from "@/features/equipment/lib/equipmentDirectory";
import type { EquipmentDirectoryPage } from "@/features/equipment/server/loadEquipmentDirectoryPage";
import { createWorkOrderHandoffHref } from "@/features/vehicles/lib/vehicleWorkspace";

const mocks = vi.hoisted(() => ({
  role: "owner" as string,
  entitlement: "enabled" as string,
  load: vi.fn(),
  work: vi.fn(),
  admin: vi.fn(() => ({ source: "admin" })),
}));
vi.mock("next/cache", () => ({ unstable_noStore: vi.fn() }));
vi.mock("@/features/shared/lib/server/admin-access", () => ({
  requireShopPageAccess: async ({
    allowRoles,
  }: {
    allowRoles: readonly string[];
  }) => {
    if (!allowRoles.includes(mocks.role)) throw new Error("Access denied");
    return {
      profile: { id: "staff", shop_id: "authorized-shop" },
      canonicalRole: mocks.role,
    };
  },
}));
vi.mock("@/features/shared/lib/supabase/server", () => ({
  createAdminSupabase: mocks.admin,
  createServerSupabaseRSC: () => ({ source: "session" }),
}));
vi.mock("@/features/equipment/server/pageEntitlement", () => ({
  resolveEquipmentPageEntitlement: async () => mocks.entitlement,
}));
vi.mock("@/features/equipment/server/loadEquipmentDirectoryPage", () => ({
  loadEquipmentDirectoryPage: mocks.load,
}));
vi.mock("@/features/equipment/server/loadEquipmentWorkQueue", () => ({
  loadEquipmentWorkQueue: mocks.work,
}));

import NewWorkPage from "../app/equipment/work-orders/new/page";
import WorkPage from "../app/equipment/work-orders/page";
import EquipmentWorkOrderAssetPicker from "@/features/equipment/components/EquipmentWorkOrderAssetPicker";

const asset = (
  patch: Partial<EquipmentDirectoryRow> = {},
): EquipmentDirectoryRow => ({
  assetId: "asset-1",
  href: "/equipment/asset-1",
  unitNumber: "EX-12",
  year: 2024,
  make: "CAT",
  model: "320",
  equipmentClass: "crawler_excavator",
  equipmentClassLabel: "Crawler excavator",
  serialNumber: "SERIAL-NOT-A-VIN",
  primaryMeter: "hours",
  engineHours: 120,
  odometer: null,
  odometerUnit: null,
  currentCycles: null,
  customerId: "customer-1",
  customerName: "North Yard",
  siteName: "North pit",
  operatingStatus: "operational",
  openDefects: { total: 0, failed: 0 },
  pm: { state: "ok", dueCount: 0 },
  openWorkOrderCount: 0,
  inspection: { state: "none", recordedAt: null },
  actions: {
    createWorkOrderHref: createWorkOrderHandoffHref({
      customerId: "customer-1",
      vehicleId: "asset-1",
    }),
    recordMeterHref: null,
  },
  lastServiceAt: null,
  nextService: null,
  activeWorkOrder: null,
  mountedOnAssetId: null,
  ...patch,
});
const directory = (rows = [asset()]): EquipmentDirectoryPage => ({
  rows,
  info: {
    page: 1,
    pageCount: 1,
    total: rows.length,
    from: rows.length ? 1 : 0,
    to: rows.length,
  },
  totalAssets: rows.length,
  facets: { classes: [], customers: [["customer-1", "North Yard"]] },
  indexCapped: false,
  evidencePartial: false,
});
beforeEach(() => {
  mocks.role = "owner";
  mocks.entitlement = "enabled";
  mocks.load.mockReset().mockResolvedValue(directory());
  mocks.work.mockReset().mockResolvedValue({ rows: [], partial: false, assets: [], statuses: [], summary: {records: 0, workOrders: 0, estimates: 0, active: 0}, info: {page: 1, pageCount: 1, total: 0, from: 0, to: 0} });
  mocks.admin.mockClear();
});

describe("Equipment Work creation entry", () => {
  it.each(ROLE_GROUPS.workOrderCreators)(
    "offers creation to %s and uses the existing handoff",
    async (role) => {
      mocks.role = role;
      const { unmount } = render(await WorkPage({}));
      expect(
        screen.getByRole("link", { name: "New Work Order" }),
      ).toHaveAttribute("href", "/equipment/work-orders/new");
      unmount();
      render(await NewWorkPage({}));
      const link = screen.getByRole("link", { name: /Create work order for/ });
      const url = new URL(link.getAttribute("href")!, "https://example.test");
      expect(url.pathname).toBe("/work-orders/create");
      expect(Object.fromEntries(url.searchParams)).toEqual({
        autostart: "1",
        customerId: "customer-1",
        vehicleId: "asset-1",
      });
      expect(link.getAttribute("href")).not.toContain("SERIAL-NOT-A-VIN");
      expect(mocks.load).toHaveBeenCalledWith(
        expect.objectContaining({ shopId: "authorized-shop", role }),
      );
    },
  );

  it("preserves the parts role's read-only queue while denying the creation route", async () => {
    mocks.role = "parts";
    render(await WorkPage({}));
    expect(screen.queryByRole("link", { name: "New Work Order" })).toBeNull();
    mocks.admin.mockClear();
    await expect(NewWorkPage({})).rejects.toThrow("Access denied");
    expect(mocks.load).not.toHaveBeenCalled();
    expect(mocks.admin).not.toHaveBeenCalled();
  });

  it.each(["mechanic", "customer", "fleet_manager", "driver", "unknown"])(
    "denies %s before reading shop-wide assets",
    async (role) => {
      mocks.role = role as CanonicalRole;
      await expect(NewWorkPage({})).rejects.toThrow("Access denied");
      expect(mocks.load).not.toHaveBeenCalled();
      expect(mocks.admin).not.toHaveBeenCalled();
    },
  );

  it.each(["disabled", "error"])(
    "checks entitlement %s before privileged reads",
    async (state) => {
      mocks.entitlement = state;
      const page = await NewWorkPage({});
      expect(page.props.retryHref).toBe("/equipment/work-orders/new");
      expect(mocks.load).not.toHaveBeenCalled();
      expect(mocks.admin).not.toHaveBeenCalled();
    },
  );

  it("passes bounded identity filters and server-derived shop scope to the existing directory", async () => {
    await NewWorkPage({
      searchParams: Promise.resolve({
        q: " EX-12 ",
        customer: "customer-1",
        page: "2",
        shopId: "other-shop",
        pm: "overdue",
        attention: "1",
      }),
    });
    expect(mocks.load).toHaveBeenCalledWith(
      expect.objectContaining({
        shopId: "authorized-shop",
        filters: parseDirectoryFilters({
          q: "EX-12",
          customer: "customer-1",
          page: "2",
        }),
      }),
    );
  });

  it("never invents a creation link for an ineligible asset or account", () => {
    render(
      <EquipmentWorkOrderAssetPicker
        directory={directory([
          asset({
            actions: { createWorkOrderHref: null, recordMeterHref: null },
          }),
        ])}
        filters={parseDirectoryFilters({})}
      />,
    );
    expect(
      screen.queryByRole("link", { name: /Create work order for/ }),
    ).toBeNull();
    expect(screen.getByText(/Creation is unavailable/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open asset" })).toHaveAttribute(
      "href",
      "/equipment/asset-1",
    );
  });

  it("preserves search and customer filters across pages without creating work during browsing", () => {
    const data = directory();
    data.info = {
      ...data.info,
      page: 2,
      pageCount: 3,
      total: 120,
      from: 51,
      to: 100,
    };
    render(
      <EquipmentWorkOrderAssetPicker
        directory={data}
        filters={parseDirectoryFilters({
          q: "EX 12",
          customer: "customer-1",
          page: "2",
        })}
      />,
    );
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute(
      "href",
      "/equipment/work-orders/new?q=EX+12&customer=customer-1&page=3",
    );
    expect(screen.getByRole("textbox", { name: "Search assets" })).toHaveValue(
      "EX 12",
    );
    expect(screen.getByRole("combobox", { name: "Customer" })).toHaveValue(
      "customer-1",
    );
    expect(
      screen.getByRole("button", { name: "Search" }).closest("form"),
    ).toHaveAttribute("method", "get");
  });

  it("distinguishes an empty shop, no search matches and the existing index cap", () => {
    const data = directory([]);
    const { rerender } = render(
      <EquipmentWorkOrderAssetPicker
        directory={data}
        filters={parseDirectoryFilters({})}
      />,
    );
    expect(screen.getByText(/Add an Equipment asset and link/)).toBeTruthy();
    rerender(
      <EquipmentWorkOrderAssetPicker
        directory={{ ...data, totalAssets: 12, indexCapped: true }}
        filters={parseDirectoryFilters({ q: "missing" })}
      />,
    );
    expect(
      screen.getByText("No Equipment assets match this search."),
    ).toBeTruthy();
    expect(screen.getByRole("status")).toHaveTextContent(
      "This asset list is limited",
    );
  });
});
