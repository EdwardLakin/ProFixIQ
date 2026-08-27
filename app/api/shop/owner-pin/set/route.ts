import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import {
  OWNER_PIN_PURPOSES,
  type OwnerPinPurpose,
  setOwnerPinVerifiedCookie,
} from "@/features/shared/lib/server/owner-pin";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import {
  hashOwnerPin,
  isValidOwnerPin,
  normalizeOwnerPin,
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
    if (
      requestedPurpose &&
      !OWNER_PIN_PURPOSE_VALUES.has(requestedPurpose as OwnerPinPurpose)
    ) {
      return NextResponse.json(
        { error: "Invalid owner PIN purpose" },
        { status: 400 },
      );
    }
    const purpose = requestedPurpose
      ? (requestedPurpose as OwnerPinPurpose)
      : OWNER_PIN_PURPOSES.PRIVILEGED;

    if (!shopId || !pin) {
      return NextResponse.json(
        { error: "shopId and pin are required" },
        { status: 400 },
      );
    }

    if (!isValidOwnerPin(pin)) {
      return NextResponse.json(
        { error: "PIN must be 4 to 8 digits" },
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
        { error: "Only owner/admin can set PIN" },
        { status: 403 },
      );
    }

    const { data: completion, error: completionError } = await supabase
      .from("profiles")
      .select("completed_onboarding")
      .eq("id", profile.id)
      .maybeSingle();
    if (completionError || !completion) {
      return NextResponse.json(
        { error: "Profile authorization could not be verified" },
        { status: 503 },
      );
    }
    if (
      completion.completed_onboarding !== true &&
      purpose !== OWNER_PIN_PURPOSES.BILLING
    ) {
      return NextResponse.json(
        { error: "Complete profile setup before unlocking owner settings" },
        { status: 409 },
      );
    }

    const hash = await hashOwnerPin(pin);

    const { error: updateErr } = await supabase
      .from("shops")
      .update({
        owner_pin_hash: hash,
        owner_pin: null,
        pin: null,
      })
      .eq("id", shopId);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    const res = NextResponse.json({ ok: true });
    return setOwnerPinVerifiedCookie(res, {
      userId: user.id,
      shopId,
      purpose,
    });
  } catch (err) {
    console.error("owner-pin.set error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
