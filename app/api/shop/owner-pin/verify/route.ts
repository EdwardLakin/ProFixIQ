import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import {
  getOwnerPinCookieFromRequest,
  OWNER_PIN_PURPOSES,
  type OwnerPinPurpose,
  setOwnerPinVerifiedCookie,
  verifyOwnerPinToken,
} from "@/features/shared/lib/server/owner-pin";
import {
  normalizeOwnerPin,
  verifyOwnerPin,
} from "@/features/shared/lib/server/owner-pin-crypto";
import { resolveAuthenticatedStaffProfile } from "@/features/shared/lib/server/admin-access";

type Body = {
  shopId?: string;
  pin?: string;
  purpose?: string;
};

const OWNER_PIN_PURPOSE_VALUES = new Set<OwnerPinPurpose>(
  Object.values(OWNER_PIN_PURPOSES),
);
const SETTINGS_PURPOSES = new Set<OwnerPinPurpose>([
  OWNER_PIN_PURPOSES.SETTINGS,
  OWNER_PIN_PURPOSES.PRIVILEGED,
]);

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

async function loadOwnerAdminProfile(
  supabase: ReturnType<typeof createServerSupabaseRoute>,
  userId: string,
) {
  const { profile: resolvedProfile } =
    await resolveAuthenticatedStaffProfile(supabase, userId);
  if (!resolvedProfile) return null;

  const { data: completion } = await supabase
    .from("profiles")
    .select("completed_onboarding")
    .eq("id", resolvedProfile.id)
    .maybeSingle();

  const profile = { ...resolvedProfile, ...completion };
  const role = String(profile.role ?? "").trim().toLowerCase();
  if (role !== "owner" && role !== "admin") return null;
  return profile;
}

export async function GET(req: Request) {
  try {
    const supabase = createServerSupabaseRoute();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return noStoreJson({ error: "Unauthorized" }, 401);
    }

    const profile = await loadOwnerAdminProfile(supabase, user.id);
    if (!profile?.shop_id) {
      return noStoreJson({ ok: true, verified: false });
    }

    const token = getOwnerPinCookieFromRequest(req);
    if (!token) return noStoreJson({ ok: true, verified: false });

    const verification = verifyOwnerPinToken(token);
    if (!verification.ok) {
      return noStoreJson({ ok: true, verified: false });
    }

    const claims = verification.claims;
    if (
      claims.sub !== user.id ||
      claims.shop_id !== profile.shop_id ||
      !SETTINGS_PURPOSES.has(claims.purpose)
    ) {
      return noStoreJson({ ok: true, verified: false });
    }

    return noStoreJson({
      ok: true,
      verified: true,
      shopId: profile.shop_id,
      expiresAt: new Date(claims.exp * 1000).toISOString(),
    });
  } catch (err) {
    console.error("owner-pin.verify status error", err);
    return noStoreJson({ ok: true, verified: false });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = createServerSupabaseRoute();

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const shopId = body.shopId?.trim() ?? "";
    const pin = normalizeOwnerPin(body.pin ?? "");
    const requestedPurpose = (body.purpose ?? "").trim();
    const purpose = OWNER_PIN_PURPOSE_VALUES.has(
      requestedPurpose as OwnerPinPurpose,
    )
      ? (requestedPurpose as OwnerPinPurpose)
      : OWNER_PIN_PURPOSES.PRIVILEGED;

    if (!shopId || !pin) {
      return NextResponse.json(
        { error: "shopId and pin required" },
        { status: 400 },
      );
    }

    const profile = await loadOwnerAdminProfile(supabase, user.id);
    if (!profile) {
      return NextResponse.json(
        { error: "Only owner/admin can unlock owner settings" },
        { status: 403 },
      );
    }

    if (!profile.shop_id) {
      return NextResponse.json(
        { error: "No shop linked to your account" },
        { status: 409 },
      );
    }

    if (!profile.completed_onboarding) {
      return NextResponse.json(
        { error: "Complete profile setup before unlocking owner settings" },
        { status: 409 },
      );
    }

    if (profile.shop_id !== shopId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: shop, error: shopErr } = await supabase
      .from("shops")
      .select("id, owner_pin_hash")
      .eq("id", shopId)
      .single();

    if (shopErr || !shop) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    const pinConfigured = Boolean(shop.owner_pin_hash);

    if (!pinConfigured) {
      return NextResponse.json(
        { error: "Owner PIN not set", pinConfigured: false },
        { status: 400 },
      );
    }

    const ok = await verifyOwnerPin(pin, shop.owner_pin_hash);
    if (!ok) {
      return NextResponse.json(
        { error: "Invalid PIN", pinConfigured: true },
        { status: 401 },
      );
    }

    const res = NextResponse.json({ ok: true, pinConfigured: true });
    return setOwnerPinVerifiedCookie(res, {
      userId: user.id,
      shopId,
      purpose,
    });
  } catch (err) {
    console.error("owner-pin.verify error", err);
    const message =
      err instanceof Error ? err.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
