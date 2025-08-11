// app/api/onboarding/bootstrap-owner/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
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
  pin: string;                             // required (short password / PIN)
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
  // try seed, then seed-xyz
  let base = seed || "my-shop";
  base = toSlugSeed(base) || "my-shop";
  let candidate = base;

  for (let i = 0; i < 20; i++) {
    const { data, error } = await supabase
      .from("shop") // <-- change to "shops" if your table is plural
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();

    if (error) {
      // If error on select, break and just use candidate (very unlikely).
      break;
    }
    if (!data) {
      // slug not taken
      return candidate;
    }
    candidate = `${base}-${Math.floor(Math.random() * 10000)}`;
  }
  return `${base}-${Date.now()}`; // super unique fallback
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
  const {
    businessName,
    shopName,
    address = null,
    city = null,
    province = null,
    postal_code = null,
    timezone = "America/Edmonton",
    accepts_online_booking = true,
    slugHint = null,
    pin,
  } = body || {};

  if (!pin || String(pin).length < 4) {
    return NextResponse.json(
      { ok: false, msg: "Owner PIN required (min 4 characters)" },
      { status: 400 }
    );
  }

  // 2) If the profile already has a role, no-op (idempotent)
  const { data: prof, error: profErr } = await supabase
    .from("profiles")
    .select("id, role, shop_id, full_name, email, business_name, shop_name")
    .eq("id", user.id)
    .single();

  if (profErr) {
    // Not fatal—profile might be missing. We’ll create/update it later.
    // But we still proceed with shop creation.
    // console.warn("Profile read error:", profErr.message);
  }

  if (prof?.role) {
    // Already initialized as staff/customer; do not create another shop.
    return NextResponse.json({
      ok: true,
      msg: "Profile already initialized",
      shop_id: prof.shop_id ?? null,
    });
  }

  // 3) Create the shop with hashed PIN
  const pinHash = await bcrypt.hash(String(pin), 10);

  // Build a decent slug seed
  const seed =
    slugHint ||
    shopName ||
    businessName ||
    user.email?.split("@")[0] ||
    "my-shop";
  const slug = await ensureUniqueSlug(supabase, seed);

  // Insert payload; cast owner_pin_hash if it's not in your generated types yet
  const insertShop = {
    name: shopName || businessName || "My Shop",
    slug,
    timezone,
    accepts_online_booking,
    owner_pin_hash: pinHash,
    address,
    city,
    province,
    postal_code,
  } as unknown as Database["public"]["Tables"]["shop"]["Insert"]; // change "shop" to "shops" if needed

  const { data: newShop, error: shopErr } = await supabase
    .from("shop") // <-- change to "shops" if your table is plural
    .insert(insertShop)
    .select("id, slug")
    .single();

  if (shopErr || !newShop) {
    return NextResponse.json(
      { ok: false, msg: shopErr?.message || "Failed to create shop" },
      { status: 500 }
    );
  }

  // 4) Seed default hours (best-effort)
  try {
    await supabase.rpc("seed_default_hours", { shop_id: newShop.id });
  } catch {
    // ignore
  }

  // 5) Promote user to owner + attach shop_id; also stash business/shop names on profile
  const { error: updErr } = await supabase
    .from("profiles")
    .update({
      role: "owner" as any,
      shop_id: newShop.id,
      business_name: businessName ?? prof?.business_name ?? null,
      shop_name: shopName ?? prof?.shop_name ?? businessName ?? null,
      email: prof?.email ?? user.email ?? null,
    } as Database["public"]["Tables"]["profiles"]["Update"])
    .eq("id", user.id);

  if (updErr) {
    return NextResponse.json(
      { ok: false, msg: "Failed to update profile with owner role" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    shop_id: newShop.id,
    slug: newShop.slug,
  });
}