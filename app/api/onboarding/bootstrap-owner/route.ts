// app/api/onboarding/bootstrap-owner/route.ts
import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { hashOwnerPin, isValidOwnerPin, normalizeOwnerPin } from "@/features/shared/lib/server/owner-pin-crypto";
import { OWNER_PIN_PURPOSES, setOwnerPinVerifiedCookie } from "@/features/shared/lib/server/owner-pin";
import { createStripeClient } from "@/features/stripe/lib/stripe/client";
import {
  reconcileShopBillingFromCheckoutSession,
  reconcileShopBillingFromUser,
} from "@/features/stripe/lib/server/canonical-shop-billing";


const OWNER_SETUP_ROLES = new Set(["owner", "admin"]);
const NA_COUNTRIES = new Set(["US", "CA"]);

function cleanStr(v: unknown): string {
  return String(v ?? "").trim();
}

function cleanUpper(v: unknown): string {
  return cleanStr(v).toUpperCase();
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export async function POST(req: Request) {
  const supabase = createServerSupabaseRoute();

  try {
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ msg: "Unauthorized" }, { status: 401 });
    }

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("role, shop_id")
      .eq("id", user.id)
      .maybeSingle<{ role: string | null; shop_id: string | null }>();

    if (profileErr || !profile) {
      return NextResponse.json(
        { msg: "Profile setup required before owner onboarding." },
        { status: 403 },
      );
    }

    const normalizedRole = String(profile.role ?? "")
      .trim()
      .toLowerCase();

    if (!OWNER_SETUP_ROLES.has(normalizedRole)) {
      return NextResponse.json(
        { msg: "Only owner or admin accounts can create the first shop." },
        { status: 403 },
      );
    }

    if (profile.shop_id) {
      return NextResponse.json(
        { msg: "This account already has a shop assigned." },
        { status: 409 },
      );
    }

    const rawUnknown = (await req.json().catch(() => null)) as unknown;
    if (!isRecord(rawUnknown)) {
      return NextResponse.json({ msg: "Invalid JSON" }, { status: 400 });
    }
    const raw = rawUnknown;

    const businessName = cleanStr(raw.businessName);
    const shopName = cleanStr(raw.shopName) || businessName;
    const street = cleanStr(raw.address);
    const city = cleanStr(raw.city);
    const province = cleanStr(raw.province);
    const postal_code = cleanStr(raw.postal_code);
    const pin = normalizeOwnerPin(String(raw.pin ?? ""));

    // New NA fields (optional in step 1, but we seed safely)
    const country = NA_COUNTRIES.has(cleanUpper(raw.country))
      ? cleanUpper(raw.country)
      : "US";
    const timezone = cleanStr(raw.timezone) || "America/New_York";
    const stripeCheckoutSessionId = cleanStr(raw.stripe_checkout_session_id);

    if (!businessName || !street || !city || !province || !postal_code || !pin) {
      return NextResponse.json(
        { msg: "Missing required fields" },
        { status: 400 },
      );
    }


    if (!isValidOwnerPin(pin)) {
      return NextResponse.json(
        { msg: "PIN must be 4 to 8 digits" },
        { status: 400 },
      );
    }

    const ownerPinHash = await hashOwnerPin(pin);

    const { data: bootstrapRows, error: bootstrapErr } = await supabase.rpc(
      "bootstrap_owner_atomic",
      {
        p_business_name: businessName,
        p_shop_name: shopName,
        p_street: street,
        p_city: city,
        p_province: province,
        p_postal_code: postal_code,
        p_country: country,
        p_timezone: timezone,
        p_owner_pin_hash: ownerPinHash,
      },
    );

    const bootstrapResult = Array.isArray(bootstrapRows)
      ? (bootstrapRows as Array<{ shop_id: string | null }>)
      : [];
    const shopId = bootstrapResult[0]?.shop_id ?? null;
    if (bootstrapErr || !shopId) {
      console.error("onboarding.bootstrap_owner_atomic failed", {
        userId: user.id,
        bootstrapErr,
        bootstrapRows,
      });
      const sourceMessage = bootstrapErr?.message ?? "";
      const msg = sourceMessage.toLowerCase().includes("profile")
        ? "Your profile is missing. Sign out and sign back in, then retry onboarding."
        : sourceMessage.toLowerCase().includes("ambiguous")
          ? "Owner setup is temporarily unavailable due to a database mismatch. Please retry in a moment."
          : sourceMessage || "Failed to bootstrap owner";
      return NextResponse.json(
        { msg },
        { status: 400 },
      );
    }

    if (process.env.STRIPE_SECRET_KEY?.trim()) {
      try {
        const stripe = createStripeClient(process.env.STRIPE_SECRET_KEY);
        if (stripeCheckoutSessionId) {
          await reconcileShopBillingFromCheckoutSession({
            stripe,
            supabase,
            userId: user.id,
            shopId,
            sessionId: stripeCheckoutSessionId,
          });
        }
        await reconcileShopBillingFromUser({
          stripe,
          supabase,
          userId: user.id,
          shopId,
        });
      } catch (billingLinkErr) {
        console.error("onboarding.bootstrap_owner billing reconciliation failed", {
          userId: user.id,
          shopId,
          error: billingLinkErr,
        });
      }
    }

    const res = NextResponse.json({ ok: true, shop_id: shopId }, { status: 200 });
    return setOwnerPinVerifiedCookie(res, {
      userId: user.id,
      shopId,
      purpose: OWNER_PIN_PURPOSES.PRIVILEGED,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected server error";
    console.error("onboarding.bootstrap_owner unexpected error", e);
    return NextResponse.json({ msg }, { status: 500 });
  }
}
