// app/api/onboarding/bootstrap-owner/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { SupabaseClient } from "@supabase/supabase-js";
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
  timezone?: string | null;                // default "America/Edmonton"
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
  supabase: SupabaseClient<Database>,
  seed: string
): Promise<string> {
  const base = toSlugSeed(seed || "my-shop") || "my-shop";
  let candidate = base;

  for (let i = 0; i < 20; i++) {
    const { data, error } = await supabase
      .from("shop") // use "shops" if your table is plural
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();

    if (error) break;      // on read error, just fall through and uniquify
    if (!data) return candidate;

    candidate = `${base}-${Math.floor(Math.random() * 10000)}`;
  }
  // Final fallback if we somehow never returned
  return `${base}-${Date.now()}`;
}

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });

    // 0) Auth required
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ ok: false, msg: "Not authenticated" }, { status: 401 });
    }

    // 1) Parse body
    const raw = (await req.json().catch(() => null)) as Body | null;
    if (!raw) {
      return NextResponse.json({ ok: false, msg: "Invalid JSON" }, { status: 400 });
    }

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
    } = raw;

    if (!pin || String(pin).length < 4) {
      return NextResponse.json(
        { ok: false, msg: "Owner PIN required (min 4 characters)" },
        { status: 400 }
      );
    }

    // 2) If profile already has a role, no-op (idempotent)
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

    // 3) Create the shop with hashed PIN + unique slug
    const pinHash = await bcrypt.hash(String(pin), 10);

    const seed =
      slugHint ||
      shopName ||
      businessName ||
      user.email?.split("@")[0] ||
      "my-shop";

    const slug = await ensureUniqueSlug(supabase, seed);

    type ShopInsert =
      Database["public"]["Tables"]["shops"]["Insert"] & // change to "shops" if plural
      { owner_pin_hash: string; slug: string; name: string };

    const insertShop: Partial<ShopInsert> = {
      name: shopName || businessName || "My Shop",
      slug,
      owner_pin_hash: pinHash,
      // include optional fields when provided to avoid type complaints
      ...(timezone !== undefined ? { timezone } : {}),
      ...(accepts_online_booking !== undefined
        ? { accepts_online_booking }
        : {}),
      ...(address !== undefined ? { address } : {}),
      ...(city !== undefined ? { city } : {}),
      ...(province !== undefined ? { province } : {}),
      ...(postal_code !== undefined ? { postal_code } : {}),
    };

    const { data: newShop, error: shopErr } = await supabase
      .from("shop") // use "shops" if your table is plural
      .insert(insertShop)
      .select("id, slug")
      .single();

    if (shopErr || !newShop) {
      return NextResponse.json(
        { ok: false, msg: shopErr?.message || "Failed to create shop" },
        { status: 500 }
      );
    }

    // 4) Best-effort: seed default hours (ignore failure)
    try {
      await supabase.rpc("seed_default_hours", { shop_id: newShop.id });
    } catch {
      // non-fatal
    }

    // 5) Promote user to owner + attach shop_id; store names
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

    return NextResponse.json({
      ok: true,
      shop_id: newShop.id,
      slug: newShop.slug,
    });
  } catch (err) {
    console.error("bootstrap-owner POST error:", err);
    return NextResponse.json({ ok: false, msg: "Server error" }, { status: 500 });
  }
}