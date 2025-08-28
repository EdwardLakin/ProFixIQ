// app/api/onboarding/bootstrap-owner/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient<Database>({ cookies });

  // 1) Require a signed-in user
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ msg: "Unauthorized" }, { status: 401 });
  }

  // 2) Read JSON payload
  const body = await req.json().catch(() => ({}));
  const {
    businessName,
    shopName,
    address,
    city,
    province,
    postal_code,
    pin,
  } = body ?? {};

  if (!businessName || !address || !city || !province || !postal_code || !pin) {
    return NextResponse.json({ msg: "Missing required fields" }, { status: 400 });
  }

  // 3) Insert shop (RLS: INSERT allowed to authenticated)
  const { data: shop, error: shopErr } = await supabase
    .from("shops")
    .insert({
      owner_id: user.id,
      business_name: String(businessName).trim(),
      shop_name: String(shopName || businessName).trim(),
      street: String(address).trim(),
      city: String(city).trim(),
      province: String(province).trim(),
      postal_code: String(postal_code).trim(),
      // store a hashed pin if you keep one; or drop it
      // owner_pin_hash: await hashPin(pin)
    })
    .select("id")
    .single();

  if (shopErr) {
    return NextResponse.json({ msg: shopErr.message }, { status: 400 });
  }

  // 4) Set profile to owner + link shop
  const { error: profErr } = await supabase
    .from("profiles")
    .update({
      role: "owner" as any,
      shop_id: shop.id,
    })
    .eq("id", user.id);

  if (profErr) {
    return NextResponse.json({ msg: profErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, shop_id: shop.id });
}