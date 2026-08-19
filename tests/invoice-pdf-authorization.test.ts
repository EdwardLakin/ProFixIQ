import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ROLE_GROUPS } from "@/features/shared/lib/rbac";

const mocks = vi.hoisted(() => ({
  resolveAuthenticatedStaffProfile: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/shared/lib/server/admin-access", () => ({
  resolveAuthenticatedStaffProfile: mocks.resolveAuthenticatedStaffProfile,
}));

import { canAccessInvoicePdf } from "@/features/invoices/server/authorizeInvoicePdfAccess";

const read = (path: string) => readFileSync(path, "utf8");

const versionRoute = read("app/api/invoice-versions/[id]/pdf/route.ts");
const workOrderRoute = read("app/api/work-orders/[id]/invoice-pdf/route.ts");

type RpcResult = {
  data: boolean | null;
  error: { message: string } | null;
};

type InvoicePdfSupabase = Parameters<
  typeof canAccessInvoicePdf
>[0]["supabase"];

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
  });

  it("limits staff PDF access to the canonical billing roles", () => {
    expect(ROLE_GROUPS.billingOperators).toEqual([
      "owner",
      "admin",
      "manager",
      "advisor",
      "service",
    ]);
    expect(ROLE_GROUPS.billingOperators).not.toContain("mechanic");
    expect(ROLE_GROUPS.billingOperators).not.toContain("parts");
  });

  it("allows a same-shop billing operator to render a working draft without consulting portal membership", async () => {
    mocks.resolveAuthenticatedStaffProfile.mockResolvedValue(
      staffProfile("owner", "shop-a"),
    );
    const client = sessionClient();

    await expect(
      canAccessInvoicePdf({
        supabase: client.supabase,
        authUserId: "user-1",
        shopId: "shop-a",
        customerId: null,
        customerVisibleDocument: false,
      }),
    ).resolves.toBe(true);

    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("denies same-shop non-billing staff", async () => {
    mocks.resolveAuthenticatedStaffProfile.mockResolvedValue(
      staffProfile("mechanic", "shop-a"),
    );
    const client = sessionClient();

    await expect(
      canAccessInvoicePdf({
        supabase: client.supabase,
        authUserId: "user-1",
        shopId: "shop-a",
        customerId: null,
        customerVisibleDocument: true,
      }),
    ).resolves.toBe(false);

    expect(client.rpc).not.toHaveBeenCalled();
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
        customerId: null,
        customerVisibleDocument: true,
      }),
    ).resolves.toBe(false);

    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("allows an authenticated portal customer only for a customer-visible document with durable membership", async () => {
    const client = sessionClient({ data: true, error: null });

    await expect(
      canAccessInvoicePdf({
        supabase: client.supabase,
        authUserId: "portal-user",
        shopId: "shop-a",
        customerId: "customer-a",
        customerVisibleDocument: true,
      }),
    ).resolves.toBe(true);

    expect(client.rpc).toHaveBeenCalledWith(
      "profixiq_is_portal_customer_for",
      {
        p_customer_id: "customer-a",
        p_shop_id: "shop-a",
      },
    );
  });

  it("denies a portal customer a draft before consulting otherwise-valid membership", async () => {
    const client = sessionClient({ data: true, error: null });

    await expect(
      canAccessInvoicePdf({
        supabase: client.supabase,
        authUserId: "portal-user",
        shopId: "shop-a",
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
        customerId: null,
        customerVisibleDocument: true,
      }),
    ).resolves.toBe(false);

    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("gates service-role invoice-version rendering on customer-visible lifecycle", () => {
    expect(versionRoute).toContain("canAccessInvoicePdf");
    expect(versionRoute).toContain("customerId: workOrder?.customer_id ?? null");
    expect(versionRoute).toContain("CUSTOMER_VISIBLE_INVOICE_STATES.includes(");
    expect(versionRoute).toContain("version.lifecycle_status");
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
    expect(workOrderRoute).toContain("const activeVersion = await getActiveInvoiceVersion");
    expect(workOrderRoute).toContain("canAccessInvoicePdf");
    expect(workOrderRoute).toContain("customerId: workOrder.customer_id");
    expect(workOrderRoute).toContain("customerVisibleDocument: activeVersion !== null");
    expect(workOrderRoute).toContain(
      'NextResponse.json({ error: "Forbidden" }, { status: 403 })',
    );
  });
});
