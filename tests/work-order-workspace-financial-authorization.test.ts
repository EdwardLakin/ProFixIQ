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
import { projectRoleShapedWorkOrderDetail } from "@/features/work-orders/workspace/workOrderFinancialProjection";

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
    expect(page).toContain("WORKSPACE_CAPABILITIES.viewWorkOrderInvoice");
  });

  it("gates every canonical invoice and pricing mutation with effective Workspace capabilities", () => {
    for (const routePath of [
      "app/api/invoices/finalize/route.ts",
      "app/api/invoices/send/route.ts",
      "app/api/payments/manual/route.ts",
    ]) {
      const route = readFileSync(join(process.cwd(), routePath), "utf8");
      expect(route).toContain("requiredWorkspaceCapability");
      expect(route).toContain("WORKSPACE_CAPABILITIES.manageWorkOrderInvoice");
    }

    const pricingRoute = readFileSync(
      join(process.cwd(), "app/api/invoices/pricing-overrides/route.ts"),
      "utf8",
    );
    expect(pricingRoute).toContain("requiredWorkspaceCapability");
    expect(pricingRoute).toContain(
      "WORKSPACE_CAPABILITIES.editWorkOrderPricing",
    );
  });

  it("uses capability-backed invoice PDF and read-only invoice UI decisions", () => {
    const pdfAccess = readFileSync(
      join(
        process.cwd(),
        "features/invoices/server/authorizeInvoicePdfAccess.ts",
      ),
      "utf8",
    );
    const invoiceClient = readFileSync(
      join(
        process.cwd(),
        "features/work-orders/components/InvoicePreviewPageClient.tsx",
      ),
      "utf8",
    );

    expect(pdfAccess).toContain("resolveWorkOrderFinancialAccess");
    expect(pdfAccess).toContain("financial.access.canViewInvoice");
    expect(pdfAccess).toContain("profixiq_is_portal_customer_for");
    expect(pdfAccess).not.toContain("BILLING_ROLES");
    expect(invoiceClient).toContain(
      "WORKSPACE_CAPABILITIES.editWorkOrderPricing",
    );
    expect(invoiceClient).toContain(
      "WORKSPACE_CAPABILITIES.manageWorkOrderInvoice",
    );
    expect(invoiceClient).toContain("!activeInvoiceVersion && canEditPricing");
  });

  it("redacts denied financial fields before a snapshot crosses the server boundary", () => {
    const financialAccess = deniedWorkOrderFinancialAccess();
    const result = projectRoleShapedWorkOrderDetail({
      workOrder: {
        id: "wo-1",
        shop_id: SHOP_ID,
        invoice_total: 999,
        labor_total: 500,
        parts_total: 499,
        outstanding_balance: 999,
        payment_status: "unpaid",
      } as never,
      lines: [{ id: "line-1", price_estimate: 450 }] as never,
      quoteLines: [
        {
          id: "quote-1",
          discount_total: 10,
          grand_total: 450,
          labor_rate: 150,
          metadata: { price: 450 },
        },
      ] as never,
      vehicle: null,
      customer: null,
      techNamesById: {},
      lineContext: {
        allocationsByLine: {
          "line-1": [{ id: "allocation-1", unit_cost: 75 }] as never,
        },
        canonicalPartsByLine: {
          "line-1": [
            {
              id: "part-1",
              total_price: 150,
              unit_price: 150,
              unit_sell_price_snapshot: 150,
              unit_cost_snapshot: 75,
            },
          ] as never,
        },
        technicianIdsByLine: {},
        activeTechnicianIdsByLine: {},
        partRequestsByLine: {},
        partRequestsByQuoteLine: {},
      },
      shopLaborRate: 150,
      financialAccess,
      latestInvoiceReview: {
        ok: true,
        issues: [],
        created_at: "2026-08-24T00:00:00.000Z",
      },
    });

    expect(result.workOrder.invoice_total).toBeNull();
    expect(result.workOrder.labor_total).toBeNull();
    expect(result.workOrder.outstanding_balance).toBe(0);
    expect(result.lines[0]?.price_estimate).toBeNull();
    expect(result.quoteLines[0]?.grand_total).toBeNull();
    expect(result.quoteLines[0]?.metadata).toBeNull();
    expect(result.lineContext.allocationsByLine["line-1"]?.[0]?.unit_cost).toBe(
      0,
    );
    expect(
      result.lineContext.canonicalPartsByLine["line-1"]?.[0]
        ?.unit_cost_snapshot,
    ).toBeNull();
    expect(result.shopLaborRate).toBeNull();
    expect(result.latestInvoiceReview).toBeNull();
  });

  it("retires browser financial-table readers and adds restrictive RLS", () => {
    for (const path of [
      "app/work-orders/[id]/Client.tsx",
      "features/work-orders/components/workorders/FocusedJobModal.tsx",
      "features/work-orders/mobile/MobileFocusedJob.tsx",
    ]) {
      const source = readFileSync(join(process.cwd(), path), "utf8");
      expect(source).toContain("workspace-detail");
      expect(source).not.toMatch(
        /\.from\("(?:work_orders|work_order_part_allocations|work_order_parts)"\)\s*\.select/,
      );
    }

    const mobileLoader = readFileSync(
      join(
        process.cwd(),
        "features/work-orders/mobile/server/loadMobileWorkOrderDetail.ts",
      ),
      "utf8",
    );
    const offlineRoute = readFileSync(
      join(process.cwd(), "app/api/offline/technician-work-orders/route.ts"),
      "utf8",
    );
    const migration = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20260824020000_enforce_work_order_financial_read_boundaries.sql",
      ),
      "utf8",
    );

    expect(mobileLoader).toContain("loadRoleShapedWorkOrderDetail");
    expect(offlineRoute).toContain("projectWorkOrderFinancialFields");
    expect(offlineRoute).toContain(
      "projectCanonicalLineContextFinancialFields",
    );
    expect(migration).toContain("as restrictive");
    expect(migration).toContain("workspace_actor_has_capability");
    expect(migration).toContain("'work_order.invoice.manage'");
    expect(migration).toContain("'work_order.pricing.edit'");
    expect(migration).toContain("'work_order.parts.cost.view'");
  });
});
