// app/api/onboarding/shop-defaults/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

const NA_COUNTRIES = new Set(["US", "CA"]);
const ADMIN_ROLES = new Set(["owner", "admin"]);

function cleanStr(v: unknown): string {
  return String(v ?? "").trim();
}
function cleanUpper(v: unknown): string {
  return cleanStr(v).toUpperCase();
}
function cleanNum(v: unknown): number | null {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  if (!Number.isFinite(n)) return null;
  return n;
}

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let raw: any;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const country = NA_COUNTRIES.has(cleanUpper(raw.country))
    ? cleanUpper(raw.country)
    : null;
  const province = cleanStr(raw.province);
  const timezone = cleanStr(raw.timezone);

  const labor_rate = cleanNum(raw.labor_rate);
  const tax_rate = cleanNum(raw.tax_rate);
  const diagnostic_fee = cleanNum(raw.diagnostic_fee);
  const supplies_percent = cleanNum(raw.supplies_percent);

  if (!country || !province || !timezone) {
    return NextResponse.json(
      { error: "Missing country / province / timezone" },
      { status: 400 },
    );
  }
  if (labor_rate === null || tax_rate === null) {
    return NextResponse.json(
      { error: "Missing labor_rate / tax_rate" },
      { status: 400 },
    );
  }

  // Who am I + shop scope?
  const { data: me, error: meErr } = await supabase
    .from("profiles")
    .select("id, role, shop_id")
    .eq("id", user.id)
    .maybeSingle<{ id: string; role: string | null; shop_id: string | null }>();

  if (meErr || !me?.shop_id) {
    return NextResponse.json({ error: "Missing shop" }, { status: 403 });
  }

  const role = String(me.role ?? "").toLowerCase();
  if (!ADMIN_ROLES.has(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const shopId = me.shop_id;

  // Update core shop defaults
  const { error: sErr } = await supabase
    .from("shops")
    .update({
      country,
      province,
      timezone,
      labor_rate,
      tax_rate,
      diagnostic_fee: diagnostic_fee ?? null,
      supplies_percent: supplies_percent ?? null,
    } as DB["public"]["Tables"]["shops"]["Update"])
    .eq("id", shopId);

  if (sErr) {
    return NextResponse.json({ error: sErr.message }, { status: 500 });
  }

  // Keep shop_profiles aligned
  const { error: spErr } = await supabase.from("shop_profiles").upsert(
    {
      shop_id: shopId,
      country,
      province,
    } as DB["public"]["Tables"]["shop_profiles"]["Insert"],
    { onConflict: "shop_id" },
  );

  if (spErr) {
    return NextResponse.json({ error: spErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}