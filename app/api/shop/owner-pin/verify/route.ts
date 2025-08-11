import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import bcrypt from "bcryptjs";
import type { Database } from "@shared/types/types/supabase";

const COOKIE_NAME = "pfq_owner_pin_shop";
const TTL_MINUTES = 30; // how long the “verified” cookie lasts

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });

    // must be logged in
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { shopId, pin } = (await req.json().catch(() => ({}))) as {
      shopId?: string;
      pin?: string;
    };

    if (!shopId || !pin) {
      return NextResponse.json({ error: "shopId and pin required" }, { status: 400 });
    }

    // fetch shop (owner + stored hash)
    const { data: shop, error } = await supabase
      .from("shops")
      .select("id, owner_id, owner_pin_hash")
      .eq("id", shopId)
      .single();

    if (error || !shop) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }
    if (shop.owner_id !== user.id) {
      return NextResponse.json({ error: "Only the shop owner can verify" }, { status: 403 });
    }
    if (!shop.owner_pin_hash) {
      return NextResponse.json({ error: "PIN not set" }, { status: 400 });
    }

    // compare
    const ok = await bcrypt.compare(pin, shop.owner_pin_hash);
    if (!ok) {
      return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
    }

    // success -> issue short-lived cookie on the response
    const res = NextResponse.json({
      ok: true,
      shopId,
      expiresAt: new Date(Date.now() + TTL_MINUTES * 60_000).toISOString(),
    });

    res.cookies.set({
      name:       COOKIE_NAME,
      value:      shopId,
      httpOnly:   true,
      sameSite:   "lax",
      secure:     true,
      path:       "/",
      maxAge:     TTL_MINUTES * 60, // seconds
    });

    return res;
  } catch (err) {
    console.error("owner-pin.verify error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}