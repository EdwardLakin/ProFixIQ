import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

const COOKIE_NAME = "pfq_owner_pin_shop";

// Read a cookie value from the incoming Request headers (works everywhere)
function getCookieFromReq(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie");
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

/**
 * GET /api/settings/hours?shopId=...
 * Returns current weekly hours for the shop.
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
    .from("shop_hours")
    .select("*")
    .eq("shop_id", shopId)
    .order("weekday", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ hours: data || [] });
}

/**
 * POST /api/settings/hours
 * Body: { shopId: string, hours: Array<{weekday:0-6, open_time:'HH:MM', close_time:'HH:MM'}> }
 * Replaces the provided hours for the week. PIN cookie required.
 */
export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies });
    const body = (await req.json().catch(() => ({}))) as {
      shopId?: string;
      hours?: { weekday: number; open_time: string; close_time: string }[];
    };

    const shopId = body.shopId ?? null;
    const updates = body.hours ?? [];

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

    // Read the owner-PIN cookie from the request headers (no TS issues)
    const pinCookie = getCookieFromReq(req, COOKIE_NAME);
    if (!pinCookie || pinCookie !== shopId) {
      return NextResponse.json({ error: "Owner PIN required" }, { status: 401 });
    }

    if (!shopId || !Array.isArray(updates)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // Replace existing hours with the new set
    const { error: delErr } = await supabase
      .from("shop_hours")
      .delete()
      .eq("shop_id", shopId);
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    if (updates.length) {
      const rows = updates.map((h) => ({
        shop_id: shopId,
        weekday: h.weekday,
        open_time: h.open_time,
        close_time: h.close_time,
      }));
      const { error: insErr } = await supabase.from("shop_hours").insert(rows);
      if (insErr) {
        return NextResponse.json({ error: insErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("settings.hours POST error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}