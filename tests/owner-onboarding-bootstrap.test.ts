import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const PROBE_SHOP_ID = "00000000-0000-4000-8000-000000000002";
const SHOP_ID = "11111111-1111-4111-8111-111111111111";

const mocks = vi.hoisted(() => {
  const adminFrom = vi.fn();
  return {
    getUser: vi.fn(),
    maybeSingle: vi.fn(),
    rpc: vi.fn(),
    hashOwnerPin: vi.fn(),
    verifyOwnerPin: vi.fn(),
    setOwnerPinVerifiedCookie: vi.fn((response: Response) => response),
    adminFrom,
    adminShopMaybeSingle: vi.fn(),
    adminShopLookupLimit: vi.fn(),
    adminPendingProfileMaybeSingle: vi.fn(),
    adminCompleteProfileMaybeSingle: vi.fn(),
    admin: { from: adminFrom },
    stripe: { kind: "stripe" },
    reconcileShopBillingFromUser: vi.fn(),
  };
});

vi.mock("@/features/shared/lib/supabase/server", () => ({
  createServerSupabaseRoute: () => ({
    auth: { getUser: mocks.getUser },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: mocks.maybeSingle })),
      })),
    })),
    rpc: mocks.rpc,
  }),
  createAdminSupabase: () => mocks.admin,
}));

vi.mock("@/features/stripe/lib/stripe/client", () => ({
  createStripeClient: () => mocks.stripe,
}));

vi.mock("@/features/stripe/lib/server/canonical-shop-billing", () => ({
  reconcileShopBillingFromUser: mocks.reconcileShopBillingFromUser,
}));

vi.mock("@/features/shared/lib/server/owner-pin-crypto", () => ({
  normalizeOwnerPin: (pin: string) => pin.trim(),
  isValidOwnerPin: (pin: string) => /^\d{4,8}$/.test(pin),
  hashOwnerPin: mocks.hashOwnerPin,
  verifyOwnerPin: mocks.verifyOwnerPin,
}));

vi.mock("@/features/shared/lib/server/owner-pin", () => ({
  OWNER_PIN_PURPOSES: { PRIVILEGED: "owner_pin:privileged" },
  setOwnerPinVerifiedCookie: mocks.setOwnerPinVerifiedCookie,
}));

function request(overrides: Record<string, unknown> = {}) {
  return new Request("https://profixiq.test/api/onboarding/bootstrap-owner", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      businessName: "High Plains Auto & Fleet",
      shopName: "High Plains Auto & Fleet",
      street: "4250 Trade Center Drive",
      city: "Denver",
      province: "CO",
      postalCode: "80216",
      country: "us",
      timezone: "America/Denver",
      pin: "4826",
      ...overrides,
    }),
  });
}

describe("owner onboarding bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    process.env.STRIPE_SECRET_KEY = "sk_test_owner_bootstrap";

    mocks.getUser.mockResolvedValue({
      data: { user: { id: "owner-user-1" } },
      error: null,
    });
    mocks.maybeSingle.mockResolvedValue({
      data: {
        shop_id: null,
        role: null,
        completed_onboarding: false,
        stripe_checkout_complete: true,
        stripe_customer_id: "cus_trial_owner",
        stripe_subscription_id: "sub_trial_owner",
      },
      error: null,
    });
    mocks.hashOwnerPin.mockResolvedValue("hashed-owner-pin");
    mocks.verifyOwnerPin.mockResolvedValue(true);
    mocks.rpc.mockImplementation(
      async (_name: string, args: Record<string, unknown>) => {
        if (args.p_country === "__PROBE__") {
          return {
            data: [{ shop_id: PROBE_SHOP_ID, created_shop: false }],
            error: null,
          };
        }
        return {
          data: [{ shop_id: SHOP_ID, created_shop: true }],
          error: null,
        };
      },
    );
    mocks.reconcileShopBillingFromUser.mockResolvedValue({ linked: true });
    mocks.adminShopLookupLimit.mockResolvedValue({ data: [], error: null });
    mocks.adminShopMaybeSingle.mockResolvedValue({
      data: {
        id: SHOP_ID,
        owner_id: "owner-user-1",
        owner_pin_hash: "hashed-existing-owner-pin",
        stripe_subscription_id: "sub_trial_owner",
        stripe_subscription_status: "trialing",
        stripe_pricing_model: "product_packages_v1",
        plan: "complete",
      },
      error: null,
    });
    mocks.adminPendingProfileMaybeSingle.mockResolvedValue({
      data: { id: "owner-user-1", completed_onboarding: false },
      error: null,
    });
    mocks.adminCompleteProfileMaybeSingle.mockResolvedValue({
      data: { id: "owner-user-1", completed_onboarding: true },
      error: null,
    });
    mocks.adminFrom.mockImplementation((table: string) => {
      if (table === "shops") {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((column: string) =>
              column === "owner_id"
                ? { limit: mocks.adminShopLookupLimit }
                : { maybeSingle: mocks.adminShopMaybeSingle },
            ),
          })),
        };
      }
      if (table === "profiles") {
        return {
          update: vi.fn((patch: { completed_onboarding?: boolean }) => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  select: vi.fn(() => ({
                    maybeSingle:
                      patch.completed_onboarding === false
                        ? mocks.adminPendingProfileMaybeSingle
                        : mocks.adminCompleteProfileMaybeSingle,
                  })),
                })),
              })),
            })),
          })),
        };
      }
      throw new Error(`Unexpected admin table: ${table}`);
    });
  });

  it("restores a real /onboarding page and keeps pending owners there", () => {
    const page = readFileSync("app/onboarding/page.tsx", "utf8");
    const form = readFileSync("app/onboarding/OwnerOnboardingForm.tsx", "utf8");

    expect(page).toContain("<OwnerOnboardingForm />");
    expect(page).toContain("if (profile?.completed_onboarding)");
    expect(page).not.toContain("profile?.shop_id || profile?.completed_onboarding");
    expect(form).toContain('fetch("/api/onboarding/bootstrap-owner"');
    expect(form).toContain("Create shop and continue");
  });

  it("requires an authenticated caller", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const { POST } = await import("../app/api/onboarding/bootstrap-owner/route");

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.reconcileShopBillingFromUser).not.toHaveBeenCalled();
  });

  it("rejects assigned non-owner staff before the privileged RPC", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        shop_id: "22222222-2222-4222-8222-222222222222",
        role: "mechanic",
        completed_onboarding: true,
      },
      error: null,
    });
    const { POST } = await import("../app/api/onboarding/bootstrap-owner/route");

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mocks.hashOwnerPin).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("validates the PIN and supported region before a new shop is hashed", async () => {
    const { POST } = await import("../app/api/onboarding/bootstrap-owner/route");

    const invalidPin = await POST(request({ pin: "12ab" }));
    const invalidTimezone = await POST(request({ timezone: "Etc/Unknown" }));

    expect(invalidPin.status).toBe(400);
    expect(invalidTimezone.status).toBe(400);
    expect(mocks.hashOwnerPin).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["US", "America/Anchorage"],
    ["US", "Pacific/Honolulu"],
    ["CA", "America/St_Johns"],
    ["CA", "America/Regina"],
  ])("accepts supported regional timezone %s %s", async (country, timezone) => {
    const { POST } = await import("../app/api/onboarding/bootstrap-owner/route");

    const response = await POST(request({ country, timezone }));

    expect(response.status).toBe(200);
  });

  it("requires a completed Stripe trial claim before shop creation", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        shop_id: null,
        role: null,
        completed_onboarding: false,
        stripe_checkout_complete: false,
        stripe_customer_id: null,
        stripe_subscription_id: null,
      },
      error: null,
    });
    const { POST } = await import("../app/api/onboarding/bootstrap-owner/route");

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mocks.hashOwnerPin).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.reconcileShopBillingFromUser).not.toHaveBeenCalled();
  });

  it("probes the hardened contract, bootstraps pending, verifies PIN, hydrates billing, then completes", async () => {
    const { POST } = await import("../app/api/onboarding/bootstrap-owner/route");

    const response = await POST(request());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual(
      expect.objectContaining({
        ok: true,
        destination: "/dashboard/onboarding-v2",
      }),
    );
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "bootstrap_owner_atomic", {
      p_business_name: "__profixiq_owner_bootstrap_v2_probe__",
      p_shop_name: "__probe__",
      p_street: "__probe__",
      p_city: "__probe__",
      p_province: "__probe__",
      p_postal_code: "__probe__",
      p_country: "__PROBE__",
      p_timezone: "Etc/UTC",
      p_owner_pin_hash: "__probe__",
    });
    expect(mocks.hashOwnerPin).toHaveBeenCalledWith("4826");
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "bootstrap_owner_atomic", {
      p_business_name: "High Plains Auto & Fleet",
      p_shop_name: "High Plains Auto & Fleet",
      p_street: "4250 Trade Center Drive",
      p_city: "Denver",
      p_province: "CO",
      p_postal_code: "80216",
      p_country: "US",
      p_timezone: "America/Denver",
      p_owner_pin_hash:
        "profixiq-owner-bootstrap-pending-v2:hashed-owner-pin",
    });
    expect(mocks.verifyOwnerPin).toHaveBeenCalledWith(
      "4826",
      "hashed-existing-owner-pin",
    );
    expect(mocks.adminPendingProfileMaybeSingle).toHaveBeenCalled();
    expect(mocks.reconcileShopBillingFromUser).toHaveBeenCalledWith({
      stripe: mocks.stripe,
      supabase: mocks.admin,
      userId: "owner-user-1",
      shopId: SHOP_ID,
    });
    expect(mocks.adminCompleteProfileMaybeSingle).toHaveBeenCalled();
    expect(mocks.setOwnerPinVerifiedCookie).toHaveBeenCalled();
  });

  it("fails closed before any mutation when the hardened database contract is not deployed", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "P0001", message: "Unsupported country" },
    });
    const { POST } = await import("../app/api/onboarding/bootstrap-owner/route");

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.hashOwnerPin).not.toHaveBeenCalled();
    expect(mocks.adminShopLookupLimit).not.toHaveBeenCalled();
    expect(mocks.reconcileShopBillingFromUser).not.toHaveBeenCalled();
    expect(mocks.setOwnerPinVerifiedCookie).not.toHaveBeenCalled();
  });

  it("rejects ambiguous historical owner recovery before the real bootstrap RPC", async () => {
    mocks.adminShopLookupLimit.mockResolvedValue({
      data: [{ id: "shop-a" }, { id: "shop-b" }],
      error: null,
    });
    const { POST } = await import("../app/api/onboarding/bootstrap-owner/route");

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.hashOwnerPin).not.toHaveBeenCalled();
    expect(mocks.reconcileShopBillingFromUser).not.toHaveBeenCalled();
  });

  it("rejects a stale concurrent request whose PIN does not match the persisted winner", async () => {
    mocks.verifyOwnerPin.mockResolvedValue(false);
    mocks.rpc.mockImplementation(
      async (_name: string, args: Record<string, unknown>) =>
        args.p_country === "__PROBE__"
          ? {
              data: [{ shop_id: PROBE_SHOP_ID, created_shop: false }],
              error: null,
            }
          : {
              data: [{ shop_id: SHOP_ID, created_shop: false }],
              error: null,
            },
    );
    const { POST } = await import("../app/api/onboarding/bootstrap-owner/route");

    const response = await POST(request({ pin: "9999" }));

    expect(response.status).toBe(401);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.verifyOwnerPin).toHaveBeenCalledWith(
      "9999",
      "hashed-existing-owner-pin",
    );
    expect(mocks.adminPendingProfileMaybeSingle).not.toHaveBeenCalled();
    expect(mocks.reconcileShopBillingFromUser).not.toHaveBeenCalled();
    expect(mocks.setOwnerPinVerifiedCookie).not.toHaveBeenCalled();
  });

  it("fails closed with onboarding pending when billing is unresolved", async () => {
    mocks.reconcileShopBillingFromUser.mockResolvedValue({
      linked: false,
      reason: "no_subscription_found",
    });
    const { POST } = await import("../app/api/onboarding/bootstrap-owner/route");

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(mocks.adminPendingProfileMaybeSingle).toHaveBeenCalled();
    expect(mocks.adminCompleteProfileMaybeSingle).not.toHaveBeenCalled();
    expect(mocks.setOwnerPinVerifiedCookie).not.toHaveBeenCalled();
  });

  it("fails closed when canonical billing was not actually persisted", async () => {
    mocks.adminShopMaybeSingle.mockResolvedValue({
      data: {
        id: SHOP_ID,
        owner_id: "owner-user-1",
        owner_pin_hash: "hashed-existing-owner-pin",
        stripe_subscription_id: null,
        stripe_subscription_status: null,
        stripe_pricing_model: null,
        plan: null,
      },
      error: null,
    });
    const { POST } = await import("../app/api/onboarding/bootstrap-owner/route");

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(mocks.adminPendingProfileMaybeSingle).toHaveBeenCalled();
    expect(mocks.adminCompleteProfileMaybeSingle).not.toHaveBeenCalled();
    expect(mocks.setOwnerPinVerifiedCookie).not.toHaveBeenCalled();
  });

  it("repairs a pending owner bootstrap only after verifying the stored PIN", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        shop_id: SHOP_ID,
        role: "owner",
        completed_onboarding: false,
        stripe_checkout_complete: true,
        stripe_customer_id: "cus_trial_owner",
        stripe_subscription_id: "sub_trial_owner",
      },
      error: null,
    });
    const { POST } = await import("../app/api/onboarding/bootstrap-owner/route");

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.hashOwnerPin).not.toHaveBeenCalled();
    expect(mocks.verifyOwnerPin).toHaveBeenCalledWith(
      "4826",
      "hashed-existing-owner-pin",
    );
    expect(mocks.reconcileShopBillingFromUser).toHaveBeenCalled();
    expect(mocks.adminCompleteProfileMaybeSingle).toHaveBeenCalled();
    expect(mocks.setOwnerPinVerifiedCookie).toHaveBeenCalled();
  });

  it("rejects a wrong PIN on a pending owner before reconciliation", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        shop_id: SHOP_ID,
        role: "owner",
        completed_onboarding: false,
        stripe_checkout_complete: true,
        stripe_customer_id: "cus_trial_owner",
        stripe_subscription_id: "sub_trial_owner",
      },
      error: null,
    });
    mocks.verifyOwnerPin.mockResolvedValue(false);
    const { POST } = await import("../app/api/onboarding/bootstrap-owner/route");

    const response = await POST(request({ pin: "9999" }));

    expect(response.status).toBe(401);
    expect(mocks.reconcileShopBillingFromUser).not.toHaveBeenCalled();
    expect(mocks.adminCompleteProfileMaybeSingle).not.toHaveBeenCalled();
    expect(mocks.setOwnerPinVerifiedCookie).not.toHaveBeenCalled();
  });

  it("reconciles and revalidates a completed owner retry only after verifying the stored PIN", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        shop_id: SHOP_ID,
        role: "owner",
        completed_onboarding: true,
        stripe_checkout_complete: true,
        stripe_customer_id: "cus_trial_owner",
        stripe_subscription_id: "sub_trial_owner",
      },
      error: null,
    });
    const { POST } = await import("../app/api/onboarding/bootstrap-owner/route");

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.verifyOwnerPin).toHaveBeenCalledWith(
      "4826",
      "hashed-existing-owner-pin",
    );
    expect(mocks.reconcileShopBillingFromUser).toHaveBeenCalled();
    expect(mocks.adminCompleteProfileMaybeSingle).toHaveBeenCalled();
    expect(mocks.setOwnerPinVerifiedCookie).toHaveBeenCalled();
  });

  it("rejects a wrong PIN on a completed owner before refreshing privileges", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: {
        shop_id: SHOP_ID,
        role: "owner",
        completed_onboarding: true,
        stripe_checkout_complete: true,
        stripe_customer_id: "cus_trial_owner",
        stripe_subscription_id: "sub_trial_owner",
      },
      error: null,
    });
    mocks.verifyOwnerPin.mockResolvedValue(false);
    const { POST } = await import("../app/api/onboarding/bootstrap-owner/route");

    const response = await POST(request({ pin: "9999" }));

    expect(response.status).toBe(401);
    expect(mocks.reconcileShopBillingFromUser).not.toHaveBeenCalled();
    expect(mocks.setOwnerPinVerifiedCookie).not.toHaveBeenCalled();
  });

  it("keeps the same RPC type shape while supporting old-app and new-app completion semantics", () => {
    const migration = readFileSync(
      "supabase/migrations/20260814160000_harden_owner_bootstrap_recovery.sql",
      "utf8",
    );

    expect(migration).toContain(
      "create or replace function public.bootstrap_owner_atomic",
    );
    expect(migration).not.toContain("bootstrap_owner_pending_v2");
    expect(migration).toContain("__profixiq_owner_bootstrap_v2_probe__");
    expect(migration).toContain("profixiq-owner-bootstrap-pending-v2:");
    expect(migration).toContain("v_effective_owner_pin_hash");
    expect(migration).toContain("completed_onboarding = not v_pending_protocol");
    expect(migration).toContain("return query select v_profile.shop_id, false");
    expect(migration).toContain("pg_catalog.pg_timezone_names");
    expect(migration).toContain("Ambiguous owner shop recovery");
    expect(migration).not.toContain("order by s.created_at desc");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = public");
    expect(migration).toContain("to authenticated");
  });

  it("preserves the original deployed RPC signature for rolling compatibility", () => {
    const deployed = readFileSync(
      "supabase/migrations/20260814041000_restore_secure_owner_bootstrap.sql",
      "utf8",
    );

    expect(deployed).toContain(
      "create or replace function public.bootstrap_owner_atomic",
    );
    expect(deployed).toContain("security definer");
    expect(deployed).toContain("Completed trial claim required");
  });
});
