import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import bcrypt from "bcryptjs";
import type { Database } from "@shared/types/types/supabase";
import { getRouteHandlerCookies, setOwnerPinVerifiedCookie } from "@/features/shared/lib/server/owner-pin";

type DB = Database;

type Body = {
  shopId?: string;
  pin?: string;
};

function normalizePin(pin: string): string {
  return pin.trim();
}

function isValidPin(pin: string): boolean {
  return /^\d{4,8}$/.test(pin);
}

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient<DB>({ cookies: getRouteHandlerCookies() });

    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const shopId = body.shopId?.trim() ?? "";
    const pin = normalizePin(body.pin ?? "");

    if (!shopId || !pin) {
      return NextResponse.json({ error: "shopId and pin are required" }, { status: 400 });
    }

    if (!isValidPin(pin)) {
      return NextResponse.json(
        { error: "PIN must be 4 to 8 digits" },
        { status: 400 }
      );
    }

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("id, role, shop_id")
      .eq("id", user.id)
      .single();

    if (profileErr || !profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 400 });
    }

    if (profile.shop_id !== shopId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (profile.role !== "owner" && profile.role !== "admin") {
      return NextResponse.json({ error: "Only owner/admin can set PIN" }, { status: 403 });
    }

    const hash = await bcrypt.hash(pin, 10);

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
    return setOwnerPinVerifiedCookie(res, shopId);
  } catch (err) {
    console.error("owner-pin.set error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
