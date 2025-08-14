import { NextResponse } from "next/server";
import { cookies as nextCookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import bcrypt from "bcryptjs";
import type { Database } from "@shared/types/types/supabase";

const COOKIE_NAME = "pfq_owner_pin_shop";
const COOKIE_MAX_AGE = 60 * 60 * 2; // 2 hours

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies: nextCookies });

    // must be logged in
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();
    if (userErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      shopId,
      pin,
    } = (await req.json().catch(() => ({}))) as { shopId?: string; pin?: string };

    if (!shopId || !pin) {
      return NextResponse.json({ error: "shopId and pin are required" }, { status: 400 });
    }

    // confirm the caller belongs to this shop (owner or staff of the shop)
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, shop_id")
      .eq("id", user.id)
      .single();

    if (!profile?.shop_id || profile.shop_id !== shopId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // load shop + hashed pin
    const { data: shop, error: shopErr } = await supabase
      .from("shops")               // change to "shop" if your table is singular
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

    // success — set cookie bound to this shop
    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE_NAME, shopId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    });
    return res;
  } catch (err) {
    console.error("owner-pin.verify error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}