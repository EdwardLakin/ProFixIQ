// app/api/onboarding/bootstrap-owner/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database["public"]["Tables"];
type ShopInsert = DB["shops"]["Insert"];
type ProfileUpdate = DB["profiles"]["Update"];

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient<Database>({ cookies });

  // 1) Require signed-in user
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json({ msg: "Unauthorized" }, { status: 401 });
  }

  // 2) Parse body
  let body: {
    businessName: string;
    shopName?: string | null;
    address: string;
    city: string;
    province: string;
    postal_code: string;
    pin?: string; // if you later hash/store it
  };
  try {
    const raw = await req.json();
    body = {
      businessName: String(raw.businessName).trim(),
      shopName: raw.shopName ? String(raw.shopName).trim() : null,
      address: String(raw.address).trim(),
      city: String(raw.city).trim(),
      province: String(raw.province).trim(),
      postal_code: String(raw.postal_code).trim(),
      pin: raw.pin ? String(raw.pin).trim() : undefined,
    };
  } catch {
    return NextResponse.json({ msg: "Invalid JSON" }, { status: 400 });
  }

  // 3) Create the shop (no owner_id column; we’ll link via profiles.shop_id)
  //    Your generated types require many fields – we set sensible defaults.
  const shopInsert: ShopInsert = {
    // required by your Insert type
    name: body.shopName ?? body.businessName,
    // optional in Insert but present in your type: provide sane defaults
    created_at: new Date().toISOString(),
    role: null, // shops shouldn't carry a user role; keep null
    address: body.address,
    city: body.city,
    province: body.province,
    postal_code: body.postal_code,
    phone_number: null,
    email: null,
    logo_url: null,
    default_labor_rate: null,
    default_shop_supplies_percent: null,
    default_diagnostic_fee: null,
    default_tax_rate: null,
    require_cause_correction: null,
    require_job_authorization: null,
    enable_ai: null,
    invoice_terms: null,
    invoice_footer: null,
    auto_email_quotes: null,
    auto_pdf_quotes: null,
    timezone: null,
    accepts_online_booking: true,
    owner_pin_hash: null, // if you decide to store pin, hash it first
    // NOTE: your Insert type does not include `slug`; PostgREST/DB can generate it via trigger if needed.
  };

  const { data: shop, error: shopErr } = await supabase
    .from("shops")
    .insert(shopInsert)
    .select("id")
    .single();

  if (shopErr || !shop) {
    return NextResponse.json({ msg: shopErr?.message ?? "Failed to create shop" }, { status: 400 });
  }

  // 4) Link profile to the new shop and mark as owner
  const profileUpdate: ProfileUpdate = {
    role: "owner" as any,
    shop_id: shop.id,
    email: null,
    street: null,
    city: null,
    province: null,
    postal_code: null
  };

  const { error: profErr } = await supabase
    .from("profiles")
    .update(profileUpdate)
    .eq("id", user.id);

  if (profErr) {
    return NextResponse.json({ msg: profErr.message }, { status: 400 });
  }

  // 5) Done
  return NextResponse.json({ ok: true, shop_id: shop.id }, { status: 200 });
}