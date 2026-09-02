import { NextResponse } from "next/server";

import { requireCanonicalPartsApiAccess } from "@/features/parts/server/fieldPartsAuthorization";

export async function GET() {
  const access = await requireCanonicalPartsApiAccess();
  if (!access.ok) return access.response;

  const { data, error } = await access.supabase
    .from("stock_locations")
    .select("id,code,name")
    .eq("shop_id", access.profile.shop_id)
    .order("code", { ascending: true });
  if (error) {
    return NextResponse.json(
      { error: "Stock locations could not be loaded." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, locations: data ?? [] });
}
