import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import {
  OWNER_PIN_PURPOSES,
  type OwnerPinPurpose,
  setOwnerPinVerifiedCookie,
} from "@/features/shared/lib/server/owner-pin";
import { normalizeOwnerPin, verifyOwnerPin } from "@/features/shared/lib/server/owner-pin-crypto";


type Body = {
  shopId?: string;
  pin?: string;
  purpose?: string;
};

const OWNER_PIN_PURPOSE_VALUES = new Set<OwnerPinPurpose>(Object.values(OWNER_PIN_PURPOSES));

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
    const purpose = OWNER_PIN_PURPOSE_VALUES.has(requestedPurpose as OwnerPinPurpose)
      ? (requestedPurpose as OwnerPinPurpose)
      : OWNER_PIN_PURPOSES.PRIVILEGED;

    if (!shopId || !pin) {
      return NextResponse.json({ error: "shopId and pin required" }, { status: 400 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, shop_id, completed_onboarding")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    if (!profile.shop_id) {
      return NextResponse.json({ error: "No shop linked to your account" }, { status: 409 });
    }

    const role = String(profile.role ?? "").toLowerCase();
    if (role !== "owner" && role !== "admin") {
      return NextResponse.json({ error: "Only owner/admin can unlock owner settings" }, { status: 403 });
    }

    if (!profile.completed_onboarding) {
      return NextResponse.json({ error: "Finish onboarding before unlocking owner settings" }, { status: 409 });
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
      return NextResponse.json({ error: "Owner PIN not set", pinConfigured: false }, { status: 400 });
    }

    const ok = await verifyOwnerPin(pin, shop.owner_pin_hash);
    if (!ok) {
      return NextResponse.json({ error: "Invalid PIN", pinConfigured: true }, { status: 401 });
    }

    const res = NextResponse.json({ ok: true, pinConfigured: true });
    return setOwnerPinVerifiedCookie(res, {
      userId: user.id,
      shopId,
      purpose,
    });
  } catch (err) {
    console.error("owner-pin.verify error", err);
    const message = err instanceof Error ? err.message : "Unexpected server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
