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

function sessionClient(rpcResult: RpcResult = { data: false, error: null }) {
  return {
    rpc: vi.fn().mockResolvedValue(rpcResult),
  } as never;
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

  it("allows a same-shop billing operator without consulting portal membership", async () => {
    mocks.resolveAuthenticatedStaffProfile.mockResolvedValue(
      staffProfile("owner", "shop-a"),
    );
    const supabase = sessionClient();

    await expect(
      canAccessInvoicePdf({
        supabase,
        authUserId: "user-1",
        shopId: "shop-a",
        customerId: null,
      }),
    ).resolves.toBe(true);

    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("denies same-shop non-billing staff", async () => {
    mocks.resolveAuthenticatedStaffProfile.mockResolvedValue(
      staffProfile("mechanic", "shop-a"),
    );
    const supabase = sessionClient();

    await expect(
      canAccessInvoicePdf({
        supabase,
        authUserId: "user-1",
        shopId: "shop-a",
        customerId: null,
      }),
    ).resolves.toBe(false);

    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("denies a billing operator from a different shop", async () => {
    mocks.resolveAuthenticatedStaffProfile.mockResolvedValue(
      staffProfile("owner", "shop-b"),
    );
    const supabase = sessionClient();

    await expect(
      canAccessInvoicePdf({
        supabase,
        authUserId: "user-1",
        shopId: "shop-a",
        customerId: null,
      }),
    ).resolves.toBe(false);

    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("allows an authenticated portal customer only when the canonical membership predicate returns true", async () => {
    const supabase = sessionClient({ data: true, error: null });

    await expect(
      canAccessInvoicePdf({
        supabase,
        authUserId: "portal-user",
        shopId: "shop-a",
        customerId: "customer-a",
      }),
    ).resolves.toBe(true);

    expect(supabase.rpc).toHaveBeenCalledWith(
      "profixiq_is_portal_customer_for",
      {
        p_customer_id: "customer-a",
        p_shop_id: "shop-a",
      },
    );
  });

  it("denies missing or revoked portal membership", async () => {
    const supabase = sessionClient({ data: false, error: null });

    await expect(
      canAccessInvoicePdf({
        supabase,
        authUserId: "portal-user",
        shopId: "shop-a",
        customerId: "customer-a",
      }),
    ).resolves.toBe(false);
  });

  it("fails closed when the portal-membership RPC errors", async () => {
    const supabase = sessionClient({
      data: null,
      error: { message: "database unavailable" },
    });

    await expect(
      canAccessInvoicePdf({
        supabase,
        authUserId: "portal-user",
        shopId: "shop-a",
        customerId: "customer-a",
      }),
    ).resolves.toBe(false);
  });

  it("fails closed without a customer relationship", async () => {
    const supabase = sessionClient({ data: true, error: null });

    await expect(
      canAccessInvoicePdf({
        supabase,
        authUserId: "portal-user",
        shopId: "shop-a",
        customerId: null,
      }),
    ).resolves.toBe(false);

    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("gates service-role invoice-version rendering before financial data is returned", () => {
    expect(versionRoute).toContain("canAccessInvoicePdf");
    expect(versionRoute).toContain("customerId: workOrder?.customer_id ?? null");
    expect(versionRoute).toContain(
      'NextResponse.json({ error: "Forbidden" }, { status: 403 })',
    );
    expect(versionRoute).not.toContain('select("user_id")');
    expect(versionRoute).not.toContain("customer?.user_id === user.id");
  });

  it("adds the same financial gate to work-order invoice PDFs", () => {
    expect(workOrderRoute).toContain(
      '.select("id,shop_id,custom_id,customer_id")',
    );
    expect(workOrderRoute).toContain("canAccessInvoicePdf");
    expect(workOrderRoute).toContain("customerId: workOrder.customer_id");
    expect(workOrderRoute).toContain(
      'NextResponse.json({ error: "Forbidden" }, { status: 403 })',
    );
  });
});
