// app/api/onboarding/bootstrap-owner/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient} from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";

type Body = {
  businessName?: string;
  shopName?: string;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  timezone?: string | null;                // default America/Edmonton
  accepts_online_booking?: boolean | null; // default true
  slugHint?: string | null;                // optional preferred slug seed
  pin: string;                             // required PIN
};

function toSlugSeed(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function ensureUniqueSlug(
  supabase: ReturnType<typeof createRouteHandlerClient<Database>>,
  seed: string
): Promise<string> {
  let base = seed || "my-shop";
  base = toSlugSeed(base) || "my-shop";
  let candidate = base;

  for (let i = 0; i < 20; i++) {
    const { data, error } = await supabase
      .from("shop") // change to "shops" if your table is plural
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();

    if (error) break;
    if (!data) return candidate;
    candidate = `${base}-${Math.floor(Math.random() * 10000)}`;
  }
  return `${base}-${Date.now()}`;
}

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient<Database>({ cookies });

  // 0) Auth required
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, msg: "No session" }, { status: 401 });
  }

  // 1) Parse and validate body
  const body = (await req.json().catch(() => ({}))) as Body;
  const businessName = body?.businessName;
  const shopName = body?.shopName;
  const address = body?.address ?? null;
  const city = body?.city ?? null;
  const province = body?.province ?? null;
  const postal_code = body?.postal_code ?? null;
  const timezone: string | null = body?.timezone ?? "America/Edmonton";
  const accepts_online_booking = body?.accepts_online_booking ?? true;
  const slugHint = body?.slugHint ?? null;
  const pin = body?.pin;

  if (!pin || String(pin).length < 4) {
    return NextResponse.json(
      { ok: false, msg: "Owner PIN required (min 4 characters)" },
      { status: 400 }
    );
  }

  // 2) If the profile already has a role, no-op (idempotent)
  const { data: prof } = await supabase
    .from("profiles")
    .select("id, role, shop_id, full_name, email, business_name, shop_name")
    .eq("id", user.id)
    .single();

  if (prof?.role) {
    return NextResponse.json({
      ok: true,
      msg: "Profile already initialized",
      shop_id: prof.shop_id ?? null,
    });
  }

  // 3) Create the shop with hashed PIN
  const pinHash = await bcrypt.hash(String(pin), 10);

  // Build slug
  const seed =
    slugHint || shopName || businessName || user.email?.split("@")[0] || "my-shop";
  const slug = await ensureUniqueSlug(supabase, seed);

  // ----- Typed insert payload -----
  // Use your generated Insert type and extend to include owner_pin_hash
  type BaseInsert = Database["public"]["Tables"]["shops"]["Insert"]; // change to "shops" if plural
  type ShopInsert = BaseInsert & { owner_pin_hash: string , slug: string};

  const insertShop: ShopInsert = {
    // required by your Insert type
    name: shopName || businessName || "My Shop",
    slug,
    timezone,                    // matches Insert type (string | null)
    accepts_online_booking,      // boolean
    address,
    city,
    province,
    postal_code,

    // fields that your generated Insert expects but are nullable (still must be present)
    role: null,
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

    // extension for hashed PIN if not yet in generated types
    owner_pin_hash: pinHash,
  };

  const { data: newShop, error: shopErr } = await supabase
    .from("shop") // change to "shops" if your table is plural
    .insert(insertShop)
    .select("id, slug")
    .single();

  if (shopErr || !newShop) {
    return NextResponse.json(
      { ok: false, msg: shopErr?.message || "Failed to create shop" },
      { status: 500 }
    );
  }

  // 4) Seed default hours (best-effort; ignore failure)
  await supabase.rpc("seed_default_hours", { shop_id: newShop.id }).match(() => {});

  // 5) Promote user to owner + attach shop_id; stash names
  const ownerRole =
    "owner" as Database["public"]["Tables"]["profiles"]["Row"]["role"];

  const { error: updErr } = await supabase
    .from("profiles")
    .update({
      role: ownerRole,
      shop_id: newShop.id,
      business_name: businessName ?? prof?.business_name ?? null,
      shop_name: shopName ?? prof?.shop_name ?? businessName ?? null,
      email: prof?.email ?? user.email ?? null,
      street: null,
      city: null,
      province: null,
      postal_code: null
    } satisfies Database["public"]["Tables"]["profiles"]["Update"])
    .eq("id", user.id);

  if (updErr) {
    return NextResponse.json(
      { ok: false, msg: "Failed to update profile with owner role" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, shop_id: newShop.id, slug: newShop.slug });
}