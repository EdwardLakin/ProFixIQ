// app/api/onboarding/bootstrap-owner/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

const NA_COUNTRIES = new Set(["US", "CA"]);

function cleanStr(v: unknown): string {
  return String(v ?? "").trim();
}

function cleanUpper(v: unknown): string {
  return cleanStr(v).toUpperCase();
}

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  try {
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ msg: "Unauthorized" }, { status: 401 });
    }

    let raw: any;
    try {
      raw = await req.json();
    } catch {
      return NextResponse.json({ msg: "Invalid JSON" }, { status: 400 });
    }

    const businessName = cleanStr(raw.businessName);
    const shopName = cleanStr(raw.shopName) || businessName;
    const street = cleanStr(raw.address);
    const city = cleanStr(raw.city);
    const province = cleanStr(raw.province);
    const postal_code = cleanStr(raw.postal_code);
    const pin = cleanStr(raw.pin);

    // New NA fields (optional in step 1, but we seed safely)
    const country = NA_COUNTRIES.has(cleanUpper(raw.country))
      ? cleanUpper(raw.country)
      : "US";
    const timezone = cleanStr(raw.timezone) || "America/New_York";

    if (!businessName || !street || !city || !province || !postal_code || !pin) {
      return NextResponse.json(
        { msg: "Missing required fields" },
        { status: 400 },
      );
    }

    // Insert shop (seed both address+street for legacy consistency)
    const shopInsert: DB["public"]["Tables"]["shops"]["Insert"] = {
      owner_id: user.id,
      business_name: businessName,
      shop_name: shopName,
      name: shopName, // keep your existing "name" column in sync
      street,
      address: street,
      city,
      province,
      postal_code,
      country,
      timezone,
      // owner_pin_hash: await hashPin(pin) // optional
      owner_pin: pin, // you have both owner_pin + pin columns in schema; keep what you use
      pin, // keep in sync if your app references pin
    };

    const { data: shop, error: shopErr } = await supabase
      .from("shops")
      .insert(shopInsert)
      .select("id")
      .single<{ id: string }>();

    if (shopErr || !shop) {
      return NextResponse.json(
        { msg: shopErr?.message ?? "Failed to create shop" },
        { status: 400 },
      );
    }

    // Seed shop_profiles so country isn't "missing" anywhere
    const { error: spErr } = await supabase.from("shop_profiles").upsert(
      {
        shop_id: shop.id,
        address_line1: street,
        city,
        province,
        postal_code,
        country,
      } as DB["public"]["Tables"]["shop_profiles"]["Insert"],
      { onConflict: "shop_id" },
    );

    if (spErr) {
      return NextResponse.json({ msg: spErr.message }, { status: 400 });
    }

    // Link profile to shop
    const { error: profErr } = await supabase
      .from("profiles")
      .update({
        role: "owner",
        shop_id: shop.id,
      } as DB["public"]["Tables"]["profiles"]["Update"])
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