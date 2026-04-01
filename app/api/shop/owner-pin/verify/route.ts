import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import bcrypt from "bcryptjs";
import type { Database } from "@shared/types/types/supabase";
import {
  getRouteHandlerCookies,
  setOwnerPinVerifiedCookie,
} from "@/features/shared/lib/server/owner-pin";

type DB = Database;

type Body = {
  shopId?: string;
  pin?: string;
};

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
    const pin = body.pin?.trim() ?? "";

    if (!shopId || !pin) {
      return NextResponse.json({ error: "shopId and pin required" }, { status: 400 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, shop_id")
      .eq("id", user.id)
      .single();

    if (!profile?.shop_id || profile.shop_id !== shopId) {
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

    if (!shop.owner_pin_hash) {
      return NextResponse.json({ error: "Owner PIN not set" }, { status: 400 });
    }

    const ok = await bcrypt.compare(pin, shop.owner_pin_hash);
    if (!ok) {
      return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
    }

    const res = NextResponse.json({ ok: true });
    return setOwnerPinVerifiedCookie(res, shopId);
  } catch (err) {
    console.error("owner-pin.verify error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
