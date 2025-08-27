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
  slugHint?: string | null;
  pin: string;                             // REQUIRED
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
    const { data } = await supabase
      .from("shops")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();

    if (!data) return candidate;
    candidate = `${base}-${Math.floor(Math.random() * 10000)}`;
  }
  return `${base}-${Date.now()}`;
}

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });

    // 0) Must be authenticated
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
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

    if (!pin || pin.length < 4) {
      return NextResponse.json(
        { ok: false, msg: "Owner PIN required (min 4 characters)" },
        { status: 400 }
      );
    }

    // 2) Idempotency: if profile already has a role, return
    const { data: prof } = await supabase
      .from("profiles")
      .select("id, role, shop_id, business_name, shop_name, email")
      .eq("id", user.id)
      .single();

    if (prof?.role) {
      return NextResponse.json({
        ok: true,
        msg: "Profile already initialized",
        shop_id: prof.shop_id ?? null,
      });
    }

    // 3) Create shop (table = shops)
    const pinHash = await bcrypt.hash(pin, 10);
    const seed =
      slugHint ||
      shopName ||
      businessName ||
      user.email?.split("@")[0] ||
      "my-shop";
    const slug = await ensureUniqueSlug(supabase, seed);

    type ShopsInsert = Database["public"]["Tables"]["shops"]["Insert"] & {
      slug: string;
      owner_pin_hash: string | null;
      name: string;
    };

    const insertShop: Partial<ShopsInsert> = {
      name: shopName || businessName || "My Shop",
      slug,
      owner_pin_hash: pinHash,
      // optional business settings (only include if defined to appease types)
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
      .from("shops")
      .insert(insertShop)
      .select("id, slug")
      .single();

    if (shopErr || !newShop) {
      return NextResponse.json(
        { ok: false, msg: shopErr?.message || "Failed to create shop" },
        { status: 500 }
      );
    }

    // 4) Best-effort: seed default hours
    try {
      await supabase.rpc("seed_default_hours", { shop_id: newShop.id });
    } catch {
      // ignore
    }

    // 5) Promote user to owner + attach shop_id.
    // NOTE: your Update type requires several keys (email, street, city, province, postal_code),
    // so we include them even when null.
    // 5) Promote user to owner + attach shop_id
const profileUpdate: Database["public"]["Tables"]["profiles"]["Update"] = {
  role: "owner",
  shop_id: newShop.id,
  business_name: businessName ?? prof?.business_name ?? null,
  shop_name: shopName ?? prof?.shop_name ?? businessName ?? null,
  email: prof?.email ?? user.email ?? null,
  street: null,
  city: null,
  province: null,
  postal_code: null
};

const { error: updErr } = await supabase
  .from("profiles")
  .update(profileUpdate)
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