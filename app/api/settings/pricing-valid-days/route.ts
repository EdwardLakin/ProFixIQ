import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { getActorCapabilities } from "@/features/shared/lib/rbac";

type DB = Database;

function clamp(v: number): number {
  if (!Number.isFinite(v)) return 30;
  return Math.max(1, Math.min(90, Math.round(v)));
}

// 🔒 Owner PIN check helper (same pattern as others)
async function verifyOwnerPin(req: NextRequest) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  const pin = req.headers.get("x-owner-pin") || "";

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, shop_id, owner_pin_hash")
    .eq("id", user.id)
    .maybeSingle();

  const actor = getActorCapabilities({ role: profile?.role });
  if (!profile || actor.canonicalRole !== "owner") return { ok: false };

  if (!profile.owner_pin_hash || pin !== profile.owner_pin_hash) {
    return { ok: false };
  }

  return { ok: true, shopId: profile.shop_id };
}

// GET current value
export async function GET(_req: NextRequest) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.shop_id) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const { data } = await supabase
    .from("shops")
    .select("menu_repair_pricing_valid_days")
    .eq("id", profile.shop_id)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    days: data?.menu_repair_pricing_valid_days ?? 30,
  });
}

// UPDATE value (PIN protected)
export async function POST(req: NextRequest) {
  const pinCheck = await verifyOwnerPin(req);
  if (!pinCheck.ok) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const raw = typeof body?.days === "number" ? body.days : 30;
  const days = clamp(raw);

  const supabase = createRouteHandlerClient<DB>({ cookies });

  const { error } = await supabase
    .from("shops")
    .update({ menu_repair_pricing_valid_days: days })
    .eq("id", pinCheck.shopId);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, days });
}
