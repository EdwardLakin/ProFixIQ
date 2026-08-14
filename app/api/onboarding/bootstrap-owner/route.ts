export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import {
  OWNER_PIN_PURPOSES,
  setOwnerPinVerifiedCookie,
} from "@/features/shared/lib/server/owner-pin";
import {
  hashOwnerPin,
  isValidOwnerPin,
  normalizeOwnerPin,
  verifyOwnerPin,
} from "@/features/shared/lib/server/owner-pin-crypto";
import {
  createAdminSupabase,
  createServerSupabaseRoute,
} from "@/features/shared/lib/supabase/server";
import {
  isSupportedShopTimezone,
  type ShopCountryCode,
} from "@/features/shared/lib/timezones/shopTimezones";
import { createStripeClient } from "@/features/stripe/lib/stripe/client";
import { reconcileShopBillingFromUser } from "@/features/stripe/lib/server/canonical-shop-billing";

const COUNTRIES = new Set<ShopCountryCode>(["US", "CA"]);
const PENDING_BOOTSTRAP_RPC = "bootstrap_owner_pending_v2" as const;

type Body = {
  businessName?: unknown;
  shopName?: unknown;
  street?: unknown;
  city?: unknown;
  province?: unknown;
  postalCode?: unknown;
  country?: unknown;
  timezone?: unknown;
  pin?: unknown;
};

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function invalidLength(value: string, maximum: number): boolean {
  return value.length === 0 || value.length > maximum;
}

function readBootstrapShopId(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const first: unknown = value[0];
  if (!first || typeof first !== "object" || !("shop_id" in first)) return null;
  return typeof first.shop_id === "string" ? first.shop_id : null;
}

async function verifyExistingOwnerPin(args: {
  userId: string;
  shopId: string;
  pin: string;
}): Promise<boolean> {
  const admin = createAdminSupabase();
  const { data: shop, error } = await admin
    .from("shops")
    .select("owner_id,owner_pin_hash")
    .eq("id", args.shopId)
    .maybeSingle();

  if (
    error ||
    !shop ||
    shop.owner_id !== args.userId ||
    !shop.owner_pin_hash
  ) {
    return false;
  }

  return verifyOwnerPin(args.pin, shop.owner_pin_hash);
}

async function reconcileAcquiredBilling(args: {
  userId: string;
  shopId: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const secretKey = String(process.env.STRIPE_SECRET_KEY ?? "").trim();
  if (!secretKey) return { ok: false, reason: "stripe_not_configured" };

  try {
    const result = await reconcileShopBillingFromUser({
      stripe: createStripeClient(secretKey),
      supabase: createAdminSupabase(),
      userId: args.userId,
      shopId: args.shopId,
    });
    return result.linked
      ? { ok: true }
      : { ok: false, reason: result.reason ?? "billing_not_linked" };
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error ? error.message : "billing_reconciliation_failed",
    };
  }
}

async function finalizeOwnerOnboarding(args: {
  userId: string;
  shopId: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const admin = createAdminSupabase();

  const { data: shop, error: shopError } = await admin
    .from("shops")
    .select(
      "id,owner_id,stripe_subscription_id,stripe_subscription_status,stripe_pricing_model,plan",
    )
    .eq("id", args.shopId)
    .maybeSingle();
  if (shopError || !shop) {
    return { ok: false, reason: shopError?.message ?? "shop_not_found" };
  }
  if (
    shop.owner_id !== args.userId ||
    !shop.stripe_subscription_id ||
    !shop.stripe_subscription_status ||
    !shop.stripe_pricing_model ||
    !shop.plan
  ) {
    return { ok: false, reason: "canonical_billing_not_ready" };
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .update({ completed_onboarding: true })
    .eq("id", args.userId)
    .eq("shop_id", args.shopId)
    .eq("role", "owner")
    .select("id,completed_onboarding")
    .maybeSingle();
  if (profileError || !profile?.completed_onboarding) {
    return {
      ok: false,
      reason: profileError?.message ?? "owner_completion_not_persisted",
    };
  }

  return { ok: true };
}

function billingUnavailable(reason: string) {
  console.error("owner onboarding billing reconciliation failed", { reason });
  return NextResponse.json(
    {
      ok: false,
      error:
        "Your shop is saved, but billing access is not ready yet. Try again before continuing.",
    },
    { status: 503 },
  );
}

function completionUnavailable(reason: string) {
  console.error("owner onboarding completion failed", { reason });
  return NextResponse.json(
    {
      ok: false,
      error:
        "Your shop and billing are saved, but setup could not be finalized. Try again.",
    },
    { status: 503 },
  );
}

function invalidExistingOwnerPin() {
  return NextResponse.json(
    { ok: false, error: "Owner PIN is incorrect." },
    { status: 401 },
  );
}

function bootstrapUpgradeUnavailable() {
  return NextResponse.json(
    {
      ok: false,
      error:
        "Shop setup is being upgraded. Try again in a moment before continuing.",
    },
    { status: 503 },
  );
}

function isPendingBootstrapRpcUnavailable(error: {
  code?: string | null;
  message?: string | null;
} | null): boolean {
  if (!error) return false;
  if (error.code === "PGRST202") return true;
  return String(error.message ?? "").includes(PENDING_BOOTSTRAP_RPC);
}

function successfulBootstrapResponse(args: {
  userId: string;
  shopId: string;
  replayed?: boolean;
}) {
  const response = NextResponse.json({
    ok: true,
    shopId: args.shopId,
    destination: "/dashboard/onboarding-v2",
    ...(args.replayed ? { replayed: true } : {}),
  });
  return setOwnerPinVerifiedCookie(response, {
    userId: args.userId,
    shopId: args.shopId,
    purpose: OWNER_PIN_PURPOSES.PRIVILEGED,
  });
}

export async function POST(request: Request) {
  const supabase = createServerSupabaseRoute();

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { ok: false, error: "Sign in to create your shop." },
        { status: 401 },
      );
    }

    const body = (await request.json().catch(() => null)) as Body | null;
    if (!body) {
      return NextResponse.json(
        { ok: false, error: "Enter your shop details and try again." },
        { status: 400 },
      );
    }

    const pin = normalizeOwnerPin(clean(body.pin));
    if (!isValidOwnerPin(pin)) {
      return NextResponse.json(
        { ok: false, error: "Owner PIN must be 4 to 8 digits." },
        { status: 400 },
      );
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select(
        "shop_id, role, completed_onboarding, stripe_checkout_complete, stripe_customer_id, stripe_subscription_id",
      )
      .eq("id", user.id)
      .maybeSingle();

    if (profileError || !profile) {
      return NextResponse.json(
        {
          ok: false,
          error: "Your owner profile is not ready. Sign out and sign in again.",
        },
        { status: 409 },
      );
    }

    if (
      profile.shop_id &&
      profile.role === "owner" &&
      profile.completed_onboarding
    ) {
      const pinVerified = await verifyExistingOwnerPin({
        userId: user.id,
        shopId: profile.shop_id,
        pin,
      });
      if (!pinVerified) return invalidExistingOwnerPin();

      const billing = await reconcileAcquiredBilling({
        userId: user.id,
        shopId: profile.shop_id,
      });
      if (!billing.ok) return billingUnavailable(billing.reason);
      return successfulBootstrapResponse({
        userId: user.id,
        shopId: profile.shop_id,
        replayed: true,
      });
    }

    if (
      profile.shop_id &&
      profile.role === "owner" &&
      !profile.completed_onboarding
    ) {
      const pinVerified = await verifyExistingOwnerPin({
        userId: user.id,
        shopId: profile.shop_id,
        pin,
      });
      if (!pinVerified) return invalidExistingOwnerPin();

      const billing = await reconcileAcquiredBilling({
        userId: user.id,
        shopId: profile.shop_id,
      });
      if (!billing.ok) return billingUnavailable(billing.reason);

      const finalized = await finalizeOwnerOnboarding({
        userId: user.id,
        shopId: profile.shop_id,
      });
      if (!finalized.ok) return completionUnavailable(finalized.reason);

      return successfulBootstrapResponse({
        userId: user.id,
        shopId: profile.shop_id,
        replayed: true,
      });
    }

    if (profile.shop_id || profile.role || profile.completed_onboarding) {
      return NextResponse.json(
        { ok: false, error: "This account is not eligible to create a new shop." },
        { status: 403 },
      );
    }

    if (
      !profile.stripe_checkout_complete ||
      !profile.stripe_customer_id ||
      !profile.stripe_subscription_id
    ) {
      return NextResponse.json(
        { ok: false, error: "Complete trial setup before creating your shop." },
        { status: 403 },
      );
    }

    const businessName = clean(body.businessName);
    const shopName = clean(body.shopName) || businessName;
    const street = clean(body.street);
    const city = clean(body.city);
    const province = clean(body.province);
    const postalCode = clean(body.postalCode);
    const country = clean(body.country).toUpperCase();
    const timezone = clean(body.timezone);

    if (
      invalidLength(businessName, 120) ||
      invalidLength(shopName, 120) ||
      invalidLength(street, 200) ||
      invalidLength(city, 100) ||
      invalidLength(province, 80) ||
      invalidLength(postalCode, 16)
    ) {
      return NextResponse.json(
        { ok: false, error: "Complete every required shop field." },
        { status: 400 },
      );
    }

    if (!COUNTRIES.has(country as ShopCountryCode)) {
      return NextResponse.json(
        { ok: false, error: "Choose a supported country." },
        { status: 400 },
      );
    }
    if (!isSupportedShopTimezone(country as ShopCountryCode, timezone)) {
      return NextResponse.json(
        { ok: false, error: "Choose a supported timezone for this country." },
        { status: 400 },
      );
    }

    const ownerPinHash = await hashOwnerPin(pin);
    const { data: rows, error: bootstrapError } = await supabase.rpc(
      PENDING_BOOTSTRAP_RPC,
      {
        p_business_name: businessName,
        p_shop_name: shopName,
        p_street: street,
        p_city: city,
        p_province: province,
        p_postal_code: postalCode,
        p_country: country,
        p_timezone: timezone,
        p_owner_pin_hash: ownerPinHash,
      },
    );
    const shopId = readBootstrapShopId(rows);

    if (bootstrapError || !shopId) {
      if (isPendingBootstrapRpcUnavailable(bootstrapError)) {
        return bootstrapUpgradeUnavailable();
      }
      console.error("owner onboarding bootstrap failed", {
        userId: user.id,
        code: bootstrapError?.code ?? null,
      });
      return NextResponse.json(
        { ok: false, error: "We could not create your shop. Please try again." },
        { status: 500 },
      );
    }

    // The v2 RPC may have created/recovered the shop for this request or
    // returned an already-owned shop after another concurrent request won the
    // profile row lock. Every path must prove the submitted PIN matches the
    // persisted owner_pin_hash before billing/finalization/privilege issuance.
    const persistedPinVerified = await verifyExistingOwnerPin({
      userId: user.id,
      shopId,
      pin,
    });
    if (!persistedPinVerified) return invalidExistingOwnerPin();

    const billing = await reconcileAcquiredBilling({ userId: user.id, shopId });
    if (!billing.ok) return billingUnavailable(billing.reason);

    const finalized = await finalizeOwnerOnboarding({
      userId: user.id,
      shopId,
    });
    if (!finalized.ok) return completionUnavailable(finalized.reason);

    return successfulBootstrapResponse({ userId: user.id, shopId });
  } catch (error) {
    console.error("owner onboarding bootstrap unexpected failure", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      { ok: false, error: "We could not create your shop. Please try again." },
      { status: 500 },
    );
  }
}
