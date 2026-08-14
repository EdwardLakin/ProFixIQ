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
} from "@/features/shared/lib/server/owner-pin-crypto";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

const COUNTRIES = new Set(["US", "CA"]);
const TIMEZONES = new Set([
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Edmonton",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Vancouver",
  "America/Toronto",
  "America/Halifax",
]);

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

    const businessName = clean(body.businessName);
    const shopName = clean(body.shopName) || businessName;
    const street = clean(body.street);
    const city = clean(body.city);
    const province = clean(body.province);
    const postalCode = clean(body.postalCode);
    const country = clean(body.country).toUpperCase();
    const timezone = clean(body.timezone);
    const pin = normalizeOwnerPin(clean(body.pin));

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

    if (!COUNTRIES.has(country) || !TIMEZONES.has(timezone)) {
      return NextResponse.json(
        { ok: false, error: "Choose a supported country and timezone." },
        { status: 400 },
      );
    }

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
        { ok: false, error: "Your owner profile is not ready. Sign out and sign in again." },
        { status: 409 },
      );
    }

    if (
      profile.shop_id &&
      profile.role === "owner" &&
      profile.completed_onboarding
    ) {
      return NextResponse.json({
        ok: true,
        destination: "/dashboard/onboarding-v2",
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

    const ownerPinHash = await hashOwnerPin(pin);
    const { data: rows, error: bootstrapError } = await supabase.rpc(
      "bootstrap_owner_atomic",
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
    const shopId = rows?.[0]?.shop_id ?? null;

    if (bootstrapError || !shopId) {
      console.error("owner onboarding bootstrap failed", {
        userId: user.id,
        code: bootstrapError?.code ?? null,
      });
      return NextResponse.json(
        { ok: false, error: "We could not create your shop. Please try again." },
        { status: 500 },
      );
    }

    const response = NextResponse.json({
      ok: true,
      shopId,
      destination: "/dashboard/onboarding-v2",
    });
    return setOwnerPinVerifiedCookie(response, {
      userId: user.id,
      shopId,
      purpose: OWNER_PIN_PURPOSES.PRIVILEGED,
    });
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
