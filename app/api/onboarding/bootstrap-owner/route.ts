// app/api/onboarding/bootstrap-owner/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });

  try {
    // 1) Require a signed-in user
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ msg: "Unauthorized" }, { status: 401 });
    }

    // 2) Read JSON payload safely
    let body;
    try {
      const raw = await req.json();
      body = {
        businessName: raw.businessName?.trim(),
        shopName: raw.shopName?.trim() ?? null,
        address: raw.address?.trim(),
        city: raw.city?.trim(),
        province: raw.province?.trim(),
        postal_code: raw.postal_code?.trim(),
        pin: raw.pin?.trim(),
      };
    } catch {
      return NextResponse.json({ msg: "Invalid JSON" }, { status: 400 });
    }

    if (
      !body.businessName ||
      !body.address ||
      !body.city ||
      !body.province ||
      !body.postal_code ||
      !body.pin
    ) {
      return NextResponse.json({ msg: "Missing required fields" }, { status: 400 });
    }

    // 3) Insert shop
    const shopInsert = {
      owner_id: user.id,
      business_name: body.businessName,
      shop_name: body.shopName || body.businessName,
      street: body.address,
      city: body.city,
      province: body.province,
      postal_code: body.postal_code,
      // owner_pin_hash: await hashPin(body.pin) // optional hashing
    };

    const { data: shop, error: shopErr } = await supabase
      .from("shops")
      .insert(shopInsert)
      .select("id")
      .single();

    if (shopErr || !shop) {
      return NextResponse.json(
        { msg: shopErr?.message ?? "Failed to create shop" },
        { status: 400 }
      );
    }

    // 4) Link profile to the new shop and mark as owner
    const { error: profErr } = await supabase
      .from("profiles")
      .update({
        role: "owner",
        shop_id: shop.id,
      })
      .eq("id", user.id);

    if (profErr) {
      return NextResponse.json({ msg: profErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, shop_id: shop.id }, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected server error";
    return NextResponse.json({ msg }, { status: 500 });
  }
}