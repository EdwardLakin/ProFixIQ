import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { requireOwnerPinVerified } from "@/features/shared/lib/server/owner-pin";
import { getActorCapabilities } from "@/features/shared/lib/rbac";

type DB = Database;

type HoursRow = {
  day_of_week: number;
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean | null;
};

type Body = {
  shopId?: string | null;
  hours?: HoursRow[] | null;
};

export async function GET() {
  try {
    const supabase = createRouteHandlerClient<DB>({ cookies });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("shop_id")
      .eq("id", user.id)
      .single();

    if (profileErr || !profile?.shop_id) {
      return NextResponse.json({ error: "Shop not found" }, { status: 404 });
    }

    const shopId = profile.shop_id;

    const { data, error } = await supabase
      .from("shop_hours")
      .select("day_of_week, open_time, close_time, is_closed")
      .eq("shop_id", shopId)
      .order("day_of_week", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ hours: data ?? [] });
  } catch (err) {
    console.error("settings/hours GET error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient<DB>({ cookies });

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const shopId = body.shopId?.trim() ?? "";

    if (!shopId) {
      return NextResponse.json({ error: "shopId required" }, { status: 400 });
    }

    const pinCheck = await requireOwnerPinVerified(req, supabase as any, shopId);
    if (!pinCheck.ok) {
      return pinCheck.response;
    }

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("shop_id, role")
      .eq("id", user.id)
      .single();

    if (profileErr || !profile?.shop_id || profile.shop_id !== shopId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const actor = getActorCapabilities({ role: profile.role });
    if (!actor.isKnownRole || (actor.canonicalRole !== "owner" && actor.canonicalRole !== "admin")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const hours = Array.isArray(body.hours) ? body.hours : [];

    const normalized = hours.map((row) => ({
      shop_id: shopId,
      day_of_week: row.day_of_week,
      open_time: row.is_closed ? null : row.open_time ?? null,
      close_time: row.is_closed ? null : row.close_time ?? null,
      is_closed: Boolean(row.is_closed),
    }));

    const { error: deleteErr } = await supabase
      .from("shop_hours")
      .delete()
      .eq("shop_id", shopId);

    if (deleteErr) {
      return NextResponse.json({ error: deleteErr.message }, { status: 500 });
    }

    if (normalized.length > 0) {
      const { error: insertErr } = await supabase.from("shop_hours").insert(normalized);
      if (insertErr) {
        return NextResponse.json({ error: insertErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("settings/hours POST error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
