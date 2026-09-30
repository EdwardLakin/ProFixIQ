import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import {
  createOwnerPinToken,
  OWNER_PIN_PURPOSES,
  type OwnerPinPurpose,
  setOwnerPinVerifiedCookie,
} from "@/features/shared/lib/server/owner-pin";
import {
  hashOwnerPin,
  isValidOwnerPin,
  normalizeOwnerPin,
} from "@/features/shared/lib/server/owner-pin-crypto";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import { resolveAuthenticatedStaffProfile } from "@/features/shared/lib/server/admin-access";

type Body = { shopId?: string; pin?: string; purpose?: string };

const purposeValues = new Set<OwnerPinPurpose>(
  Object.values(OWNER_PIN_PURPOSES),
);

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
    const requestedPurpose = body.purpose?.trim() ?? "";
    const purpose = purposeValues.has(requestedPurpose as OwnerPinPurpose)
      ? (requestedPurpose as OwnerPinPurpose)
      : OWNER_PIN_PURPOSES.PRIVILEGED;

    if (!shopId || !isValidOwnerPin(pin)) {
      return NextResponse.json(
        { error: "shopId and a 4 to 8 digit PIN are required" },
        { status: 400 },
      );
    }

    const { profile, error: profileErr } =
      await resolveAuthenticatedStaffProfile(supabase, user.id);
    if (profileErr || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 400 });
    }
    if (profile.shop_id !== shopId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const actor = getActorCapabilities({ role: profile.role });
    if (!actor.isKnownRole || !actor.canOverrideOperationalState) {
      return NextResponse.json(
        { error: "Only owner/admin can reset PIN" },
        { status: 403 },
      );
    }

    const hash = await hashOwnerPin(pin);
    // Prepare the signed proof before changing the stored PIN. Missing token
    // configuration therefore cannot leave a changed PIN with a failed response.
    const token = createOwnerPinToken({
      userId: user.id,
      shopId,
      purpose,
      ownerPinHash: hash,
    });
    const { data: updatedShop, error: updateErr } = await supabase
      .from("shops")
      .update({ owner_pin_hash: hash, owner_pin: null, pin: null })
      .eq("id", shopId)
      .select("id")
      .maybeSingle();
    if (updateErr || !updatedShop) {
      return NextResponse.json(
        { error: updateErr?.message ?? "Shop not found" },
        { status: updateErr ? 500 : 404 },
      );
    }

    const response = NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "private, no-store" } },
    );
    return setOwnerPinVerifiedCookie(response, {
      userId: user.id,
      shopId,
      purpose,
      ownerPinHash: hash,
      token,
    });
  } catch (err) {
    console.error("owner-pin.reset error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
