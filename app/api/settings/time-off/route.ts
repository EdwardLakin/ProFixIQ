import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

const COOKIE_NAME = "pfq_owner_pin_shop";

/**
 * GET /api/settings/time-off?shopId=...
 * Lists time-off entries.
 */
export async function GET(req: Request) {
  const supabase = createRouteHandlerClient<Database>({ cookies });
  const { searchParams } = new URL(req.url);
  const shopId = searchParams.get("shopId");

  if (!shopId) {
    return NextResponse.json({ error: "shopId required" }, { status: 400 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, shop_id")
    .eq("id", user.id)
    .single();

  if (!profile?.shop_id || profile.shop_id !== shopId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("shop_time_off")
    .select("*")
    .eq("shop_id", shopId)
    .order("starts_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ items: data || [] });
}

/**
 * POST /api/settings/time-off
 * Body: { shopId: string, range: { starts_at: string, ends_at: string, reason?: string } }
 * Adds a blackout range. PIN cookie required.
 */
export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });
    const body = (await req.json().catch(() => ({}))) as {
      shopId?: string;
      range?: { starts_at: string; ends_at: string; reason?: string | null };
    };

    const shopId = body.shopId ?? null;
    const range = body.range ?? null;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, shop_id")
      .eq("id", user.id)
      .single();

    if (!profile?.shop_id || profile.shop_id !== shopId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const pinCookie = (await cookies()).get(COOKIE_NAME)?.value;
    if (!pinCookie || pinCookie !== shopId) {
      return NextResponse.json({ error: "Owner PIN required" }, { status: 401 });
    }

    if (!shopId || !range?.starts_at || !range?.ends_at) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const { error: insErr } = await supabase.from("shop_time_off").insert({
      shop_id: shopId,
      starts_at: range.starts_at,
      ends_at: range.ends_at,
      reason: range.reason ?? null,
    });

    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("settings.time-off POST error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/settings/time-off
 * Body: { shopId: string, id: string }
 * Removes a blackout by id. PIN cookie required.
 */
export async function DELETE(req: Request) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });
    const body = (await req.json().catch(() => ({}))) as {
      shopId?: string;
      id?: string;
    };
    const shopId = body.shopId ?? null;
    const id = body.id ?? null;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, shop_id")
      .eq("id", user.id)
      .single();

    if (!profile?.shop_id || profile.shop_id !== shopId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const pinCookie = (await cookies()).get(COOKIE_NAME)?.value;
    if (!pinCookie || pinCookie !== shopId) {
      return NextResponse.json({ error: "Owner PIN required" }, { status: 401 });
    }

    if (!shopId || !id) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const { error: delErr } = await supabase
      .from("shop_time_off")
      .delete()
      .eq("id", id)
      .eq("shop_id", shopId);

    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("settings.time-off DELETE error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}