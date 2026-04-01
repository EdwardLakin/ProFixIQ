import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { requireOwnerPinVerified } from "@/features/shared/lib/server/owner-pin";

type DB = Database;

type TimeOffRow = {
  id?: string;
  start_date: string;
  end_date: string;
  label?: string | null;
  notes?: string | null;
};

type Body = {
  shopId?: string | null;
  entry?: TimeOffRow | null;
  entries?: TimeOffRow[] | null;
  id?: string | null;
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

    const { data, error } = await supabase
      .from("shop_time_off")
      .select("*")
      .eq("shop_id", profile.shop_id)
      .order("start_date", { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ entries: data ?? [] });
  } catch (err) {
    console.error("settings/time-off GET error", err);
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

    if (profile.role !== "owner" && profile.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const entry = body.entry;
    if (!entry?.start_date || !entry?.end_date) {
      return NextResponse.json(
        { error: "entry.start_date and entry.end_date required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("shop_time_off")
      .insert({
        shop_id: shopId,
        start_date: entry.start_date,
        end_date: entry.end_date,
        label: entry.label ?? null,
        notes: entry.notes ?? null,
      })
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, entry: data });
  } catch (err) {
    console.error("settings/time-off POST error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
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
    const id = body.id?.trim() ?? "";

    if (!shopId || !id) {
      return NextResponse.json({ error: "shopId and id required" }, { status: 400 });
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

    if (profile.role !== "owner" && profile.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error } = await supabase
      .from("shop_time_off")
      .delete()
      .eq("id", id)
      .eq("shop_id", shopId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("settings/time-off DELETE error", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
