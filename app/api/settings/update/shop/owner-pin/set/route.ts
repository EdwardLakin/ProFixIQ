// app/api/settings/owner-pin/set/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import bcrypt from "bcryptjs";
import type { Database } from "@shared/types/types/supabase";

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });

    const { shopId, currentPin, newPin } = (await req.json().catch(() => ({}))) as {
      shopId?: string;
      currentPin?: string | null;
      newPin?: string;
    };

    if (!shopId || !newPin) {
      return NextResponse.json(
        { error: "shopId and newPin are required" },
        { status: 400 }
      );
    }

    // must be logged in
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ensure caller is the owner
    const { data: shop, error } = await supabase
      .from("shops") // use "shop" here if your table is singular
      .select("id, owner_id, owner_pin_hash")
      .eq("id", shopId)
      .single();

    if (error || !shop) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }
    if (shop.owner_id !== user.id) {
      return NextResponse.json(
        { error: "Only the shop owner can set the PIN" },
        { status: 403 }
      );
    }

    // if a pin exists, verify currentPin
    if (shop.owner_pin_hash) {
      if (!currentPin) {
        return NextResponse.json(
          { error: "Current PIN required to change" },
          { status: 400 }
        );
      }
      const ok = await bcrypt.compare(currentPin, shop.owner_pin_hash);
      if (!ok) {
        return NextResponse.json({ error: "Invalid current PIN" }, { status: 401 });
      }
    }

    // hash and save
    const hash = await bcrypt.hash(newPin, 10);
    const { error: updErr } = await supabase
      .from("shops") // use "shop" if singular
      .update({ owner_pin_hash: hash })
      .eq("id", shopId);

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("owner-pin.set error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}