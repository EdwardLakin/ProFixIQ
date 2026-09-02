import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveAuthenticatedStaffProfile: vi.fn(),
  resolveWorkOrderProductAuthority: vi.fn(),
  resolveWorkOrderFinancialAccess: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/shared/lib/server/admin-access", () => ({
  resolveAuthenticatedStaffProfile: mocks.resolveAuthenticatedStaffProfile,
}));
vi.mock("@/features/mobile/service/server/access", () => ({
  resolveWorkOrderProductAuthority: mocks.resolveWorkOrderProductAuthority,
}));
vi.mock(
  "@/features/work-orders/workspace/server/workOrderFinancialAuthorization",
  () => ({
    resolveWorkOrderFinancialAccess: mocks.resolveWorkOrderFinancialAccess,
  }),
);

import { canAccessInvoicePdf } from "@/features/invoices/server/authorizeInvoicePdfAccess";

const read = (path: string) => readFileSync(path, "utf8");

const versionRoute = read("app/api/invoice-versions/[id]/pdf/route.ts");
const workOrderRoute = read("app/api/work-orders/[id]/invoice-pdf/route.ts");

type RpcResult = {
  data: boolean | null;
  error: { message: string } | null;
};

type InvoicePdfSupabase = Parameters<typeof canAccessInvoicePdf>[0]["supabase"];

function sessionClient(rpcResult: RpcResult = { data: false, error: null }) {
  const rpc = vi.fn().mockResolvedValue(rpcResult);
  return {
    supabase: { rpc } as unknown as InvoicePdfSupabase,
    rpc,
  };
}

function staffProfile(role: string, shopId: string | null) {
  return {
    profile: {
      id: "profile-1",
      user_id: "user-1",
      role,
      shop_id: shopId,
      full_name: "Test User",
    },
    error: null,
  };
}

describe("invoice PDF authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveAuthenticatedStaffProfile.mockResolvedValue({
      profile: null,
      error: null,
    });
    mocks.resolveWorkOrderFinancialAccess.mockResolvedValue({
      access: { canViewInvoice: false },
      error: null,
    });
    mocks.resolveWorkOrderProductAuthority.mockResolvedValue({
      authorized: true,
      product: "shop",
    });
  });

  it("allows effective invoice-view capability to render a working draft without consulting portal membership", async () => {
    mocks.resolveAuthenticatedStaffProfile.mockResolvedValue(
      staffProfile("owner", "shop-a"),
    );
    mocks.resolveWorkOrderFinancialAccess.mockResolvedValue({
      access: { canViewInvoice: true },
      error: null,
    });
    const client = sessionClient({ data: true, error: null });

    await expect(
      canAccessInvoicePdf({
        supabase: client.supabase,
        authUserId: "user-1",
        shopId: "shop-a",
        workOrderId: "work-order-a",
        customerId: null,
        customerVisibleDocument: false,
      }),
    ).resolves.toBe(true);

    expect(mocks.resolveWorkOrderFinancialAccess).toHaveBeenCalledWith({
      supabase: client.supabase,
      profileId: "profile-1",
      shopId: "shop-a",
    });
    expect(mocks.resolveWorkOrderProductAuthority).toHaveBeenCalledWith(
      expect.objectContaining({ authUserId: "user-1" }),
      "work-order-a",
    );
  });

  it("allows a financially authorized Field actor for a linked work order", async () => {
    mocks.resolveAuthenticatedStaffProfile.mockResolvedValue(
      staffProfile("manager", "shop-a"),
    );
    mocks.resolveWorkOrderProductAuthority.mockResolvedValue({
      authorized: true,
      product: "field",
    });
    mocks.resolveWorkOrderFinancialAccess.mockResolvedValue({
      access: { canViewInvoice: true },
      error: null,
    });
    const client = sessionClient();

    await expect(
      canAccessInvoicePdf({
        supabase: client.supabase,
        authUserId: "user-1",
        shopId: "shop-a",
        workOrderId: "work-order-a",
        customerId: null,
        customerVisibleDocument: false,
      }),
    ).resolves.toBe(true);
  });

  it("denies same-shop staff when effective invoice-view is denied", async () => {
    mocks.resolveAuthenticatedStaffProfile.mockResolvedValue(
      staffProfile("mechanic", "shop-a"),
    );
    const client = sessionClient({ data: true, error: null });

    await expect(
      canAccessInvoicePdf({
        supabase: client.supabase,
        authUserId: "user-1",
        shopId: "shop-a",
        workOrderId: "work-order-a",
        customerId: null,
        customerVisibleDocument: false,
      }),
    ).resolves.toBe(false);

    expect(mocks.resolveWorkOrderProductAuthority).toHaveBeenCalledTimes(1);
  });

  it("denies a billing operator from a different shop", async () => {
    mocks.resolveAuthenticatedStaffProfile.mockResolvedValue(
      staffProfile("owner", "shop-b"),
    );
    const client = sessionClient();

    await expect(
      canAccessInvoicePdf({
        supabase: client.supabase,
        authUserId: "user-1",
        shopId: "shop-a",
        workOrderId: "work-order-a",
        customerId: null,
        customerVisibleDocument: true,
      }),
    ).resolves.toBe(false);

    expect(mocks.resolveWorkOrderFinancialAccess).not.toHaveBeenCalled();
    expect(mocks.resolveWorkOrderProductAuthority).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("allows an authenticated portal customer only for a customer-visible document with durable membership", async () => {
    const client = sessionClient({ data: true, error: null });

    await expect(
      canAccessInvoicePdf({
        supabase: client.supabase,
        authUserId: "portal-user",
        shopId: "shop-a",
        workOrderId: "work-order-a",
        customerId: "customer-a",
        customerVisibleDocument: true,
      }),
    ).resolves.toBe(true);

    expect(client.rpc).toHaveBeenCalledWith("profixiq_is_portal_customer_for", {
      p_customer_id: "customer-a",
      p_shop_id: "shop-a",
    });
  });

  it("preserves portal membership fallback for a same-shop customer profile", async () => {
    mocks.resolveAuthenticatedStaffProfile.mockResolvedValue(
      staffProfile("customer", "shop-a"),
    );
    mocks.resolveWorkOrderProductAuthority.mockResolvedValue({
      authorized: false,
      product: null,
    });
    const client = sessionClient({ data: true, error: null });

    await expect(
      canAccessInvoicePdf({
        supabase: client.supabase,
        authUserId: "portal-user",
        shopId: "shop-a",
        workOrderId: "work-order-a",
        customerId: "customer-a",
        customerVisibleDocument: true,
      }),
    ).resolves.toBe(true);

    expect(mocks.resolveWorkOrderFinancialAccess).not.toHaveBeenCalled();
    expect(client.rpc).toHaveBeenCalledWith("profixiq_is_portal_customer_for", {
      p_customer_id: "customer-a",
      p_shop_id: "shop-a",
    });
  });

  it("denies a portal customer a draft before consulting otherwise-valid membership", async () => {
    const client = sessionClient({ data: true, error: null });

    await expect(
      canAccessInvoicePdf({
        supabase: client.supabase,
        authUserId: "portal-user",
        shopId: "shop-a",
        workOrderId: "work-order-a",
        customerId: "customer-a",
        customerVisibleDocument: false,
      }),
    ).resolves.toBe(false);

    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("denies missing or revoked portal membership", async () => {
    const client = sessionClient({ data: false, error: null });

    await expect(
      canAccessInvoicePdf({
        supabase: client.supabase,
        authUserId: "portal-user",
        shopId: "shop-a",
        workOrderId: "work-order-a",
        customerId: "customer-a",
        customerVisibleDocument: true,
      }),
    ).resolves.toBe(false);
  });

  it("fails closed when the portal-membership RPC errors", async () => {
    const client = sessionClient({
      data: null,
      error: { message: "database unavailable" },
    });

    await expect(
      canAccessInvoicePdf({
        supabase: client.supabase,
        authUserId: "portal-user",
        shopId: "shop-a",
        workOrderId: "work-order-a",
        customerId: "customer-a",
        customerVisibleDocument: true,
      }),
    ).resolves.toBe(false);
  });

  it("fails closed without a customer relationship", async () => {
    const client = sessionClient({ data: true, error: null });

    await expect(
      canAccessInvoicePdf({
        supabase: client.supabase,
        authUserId: "portal-user",
        shopId: "shop-a",
        workOrderId: "work-order-a",
        customerId: null,
        customerVisibleDocument: true,
      }),
    ).resolves.toBe(false);

    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("gates service-role invoice-version rendering on customer-visible lifecycle and work-order identity", () => {
    expect(versionRoute).toContain("canAccessInvoicePdf");
    expect(versionRoute).toContain(
      "customerId: workOrder?.customer_id ?? null",
    );
    expect(versionRoute).toContain("workOrderId: version.work_order_id");
    expect(versionRoute).toContain("CUSTOMER_VISIBLE_INVOICE_STATES.includes(");
    expect(versionRoute).toContain("version.lifecycle_status");
    expect(versionRoute).toContain(
      '.eq("work_order_id", version.work_order_id)',
    );
    expect(versionRoute).toContain(
      'NextResponse.json({ error: "Forbidden" }, { status: 403 })',
    );
    expect(versionRoute).not.toContain('select("user_id")');
    expect(versionRoute).not.toContain("customer?.user_id === user.id");
  });

  it("requires an issued active version before portal access to work-order invoice PDFs", () => {
    expect(workOrderRoute).toContain(
      '.select("id,shop_id,custom_id,customer_id")',
    );
    expect(workOrderRoute).toContain(
      "const activeVersion = await getActiveInvoiceVersion",
    );
    expect(workOrderRoute).toContain("canAccessInvoicePdf");
    expect(workOrderRoute).toContain("customerId: workOrder.customer_id");
    expect(workOrderRoute).toContain("workOrderId,");
    expect(workOrderRoute).toContain(
      "customerVisibleDocument: activeVersion !== null",
    );
    expect(workOrderRoute).toContain('.eq("work_order_id", workOrderId)');
    expect(workOrderRoute).toContain(
      'NextResponse.json({ error: "Forbidden" }, { status: 403 })',
    );
  });
});
