import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";

const mocks = vi.hoisted(() => ({
  loadRoleShapedWorkOrderDetail: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock(
  "@/features/work-orders/workspace/server/loadRoleShapedWorkOrderDetail",
  () => ({
    loadRoleShapedWorkOrderDetail: mocks.loadRoleShapedWorkOrderDetail,
  }),
);
vi.mock(
  "@/features/work-orders/workspace/server/loadWorkOrderWorkspaceSnapshot",
  () => ({
    WORK_ORDER_WORKSPACE_READER_ROLES: [
      "owner",
      "admin",
      "manager",
      "advisor",
      "service",
      "parts",
      "mechanic",
      "lead_hand",
      "foreman",
    ],
  }),
);

import { loadMobileWorkOrderDetail } from "@/features/work-orders/mobile/server/loadMobileWorkOrderDetail";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const SHOP_ID = "22222222-2222-4222-8222-222222222222";

function clientFixture(): SupabaseClient<Database> {
  return {} as SupabaseClient<Database>;
}

describe("mobile work-order detail server snapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates to the shared authorization-first role-shaped projection", async () => {
    const authorizationSupabase = clientFixture();
    const dataSupabase = clientFixture();
    const projectedSnapshot = {
      workOrder: { id: "work-order-1", shop_id: SHOP_ID },
      lines: [],
      quoteLines: [],
      vehicle: null,
      customer: null,
      techNamesById: {},
      lineContext: {
        allocationsByLine: {},
        canonicalPartsByLine: {},
        technicianIdsByLine: {},
        activeTechnicianIdsByLine: {},
        partRequestsByLine: {},
        partRequestsByQuoteLine: {},
      },
      shopLaborRate: null,
      financialAccess: {
        canViewSellPricing: false,
        canViewPartsSellPricing: false,
        canViewPartsCost: false,
        canViewGrossProfit: false,
        canViewInvoice: false,
        canManageInvoice: false,
        canEditPricing: false,
      },
      latestInvoiceReview: null,
    };
    mocks.loadRoleShapedWorkOrderDetail.mockResolvedValue(projectedSnapshot);

    await expect(
      loadMobileWorkOrderDetail({
        supabase: authorizationSupabase,
        dataSupabase,
        profileId: PROFILE_ID,
        shopId: SHOP_ID,
        routeId: "WO14",
      }),
    ).resolves.toBe(projectedSnapshot);

    expect(mocks.loadRoleShapedWorkOrderDetail).toHaveBeenCalledWith({
      authorizationSupabase,
      dataSupabase,
      profileId: PROFILE_ID,
      shopId: SHOP_ID,
      routeId: "WO14",
    });
  });

  it("preserves a denied or missing workspace result", async () => {
    mocks.loadRoleShapedWorkOrderDetail.mockResolvedValue(null);

    await expect(
      loadMobileWorkOrderDetail({
        supabase: clientFixture(),
        dataSupabase: clientFixture(),
        profileId: PROFILE_ID,
        shopId: SHOP_ID,
        routeId: "cross-tenant-id",
      }),
    ).resolves.toBeNull();
  });
});
