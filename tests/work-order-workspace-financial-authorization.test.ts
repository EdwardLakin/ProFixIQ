import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveCapabilitiesMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock(
  "@/features/workspace/authorization/server/resolveWorkspaceCapabilities",
  () => ({
    resolveCurrentWorkspaceCapabilities: resolveCapabilitiesMock,
  }),
);

import {
  WORKSPACE_CAPABILITIES,
  createDeniedWorkspaceCapabilities,
  type WorkspaceCapabilityKey,
} from "@/features/workspace/authorization/capabilities";
import {
  deniedWorkOrderFinancialAccess,
  resolveWorkOrderFinancialAccess,
} from "@/features/work-orders/workspace/server/workOrderFinancialAuthorization";

const PROFILE_ID = "11111111-1111-4111-8111-111111111111";
const SHOP_ID = "22222222-2222-4222-8222-222222222222";

function capabilityResult(grantedKeys: readonly WorkspaceCapabilityKey[]) {
  const capabilities = createDeniedWorkspaceCapabilities();
  for (const capabilityKey of grantedKeys) {
    capabilities[capabilityKey] = {
      ...capabilities[capabilityKey],
      granted: true,
      source: "profixiq_preset",
    };
  }
  return { capabilities, error: null };
}

describe("Work Order financial Workspace authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves the full financial envelope from effective Workspace capabilities", async () => {
    resolveCapabilitiesMock.mockResolvedValue(
      capabilityResult([
        WORKSPACE_CAPABILITIES.viewWorkOrderSellPricing,
        WORKSPACE_CAPABILITIES.viewWorkOrderCost,
        WORKSPACE_CAPABILITIES.viewWorkOrderGrossProfit,
        WORKSPACE_CAPABILITIES.viewWorkOrderInvoice,
        WORKSPACE_CAPABILITIES.manageWorkOrderInvoice,
        WORKSPACE_CAPABILITIES.editWorkOrderPricing,
        WORKSPACE_CAPABILITIES.viewWorkOrderPartsSellPricing,
        WORKSPACE_CAPABILITIES.viewWorkOrderPartsCost,
      ]),
    );

    const result = await resolveWorkOrderFinancialAccess({
      supabase: {},
      profileId: PROFILE_ID,
      shopId: SHOP_ID,
    });

    expect(result.error).toBeNull();
    expect(result.access).toEqual({
      canViewSellPricing: true,
      canViewCost: true,
      canViewGrossProfit: true,
      canViewInvoice: true,
      canManageInvoice: true,
      canEditPricing: true,
      canViewPartsSellPricing: true,
      canViewPartsCost: true,
    });
  });

  it("requires prerequisite visibility for GP, invoice management, and pricing edits", async () => {
    resolveCapabilitiesMock.mockResolvedValue(
      capabilityResult([
        WORKSPACE_CAPABILITIES.viewWorkOrderGrossProfit,
        WORKSPACE_CAPABILITIES.manageWorkOrderInvoice,
        WORKSPACE_CAPABILITIES.editWorkOrderPricing,
      ]),
    );

    const result = await resolveWorkOrderFinancialAccess({
      supabase: {},
      profileId: PROFILE_ID,
      shopId: SHOP_ID,
    });

    expect(result.error).toBeNull();
    expect(result.access.canViewGrossProfit).toBe(false);
    expect(result.access.canManageInvoice).toBe(false);
    expect(result.access.canEditPricing).toBe(false);
  });

  it("fails closed when the Workspace authorization service is unavailable", async () => {
    resolveCapabilitiesMock.mockResolvedValue({
      capabilities: createDeniedWorkspaceCapabilities(),
      error: "database unavailable",
    });

    const result = await resolveWorkOrderFinancialAccess({
      supabase: {},
      profileId: PROFILE_ID,
      shopId: SHOP_ID,
    });

    expect(result).toEqual({
      access: deniedWorkOrderFinancialAccess(),
      error: "database unavailable",
    });
  });

  it("defines the approved role presets without granting Lead Hand or mechanic financial access", () => {
    const migration = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20260823235900_work_order_workspace_financial_capabilities.sql",
      ),
      "utf8",
    );

    expect(migration).toContain(
      "('work_order.financial.sell.view', 'foreman', 'allow')",
    );
    expect(migration).toContain(
      "('work_order.parts.cost.view', 'parts', 'allow')",
    );
    expect(migration).toContain(
      "('work_order.invoice.manage', 'advisor', 'allow')",
    );
    expect(migration).toContain(
      "('work_order.invoice.manage', 'service', 'allow')",
    );
    expect(migration).not.toMatch(
      /'work_order\.(?:financial|invoice|pricing|parts)[^']*',\s*'(?:lead_hand|mechanic)',\s*'allow'/,
    );
  });

  it("gates invoice API and page access at the server boundary", () => {
    const route = readFileSync(
      join(process.cwd(), "app/api/work-orders/[id]/invoice/route.ts"),
      "utf8",
    );
    const page = readFileSync(
      join(process.cwd(), "app/work-orders/invoice/[id]/page.tsx"),
      "utf8",
    );

    expect(route).toContain("resolveWorkOrderFinancialAccess");
    expect(route).toContain('required: "manage"');
    expect(route).toContain('required: "view"');
    expect(route).toContain('.eq("shop_id", access.profile.shop_id)');
    expect(page).toContain("requireShopPageAccess");
    expect(page).toContain(
      "WORKSPACE_CAPABILITIES.viewWorkOrderInvoice",
    );
  });
});
