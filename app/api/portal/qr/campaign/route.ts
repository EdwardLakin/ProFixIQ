export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { getActorCapabilities } from "@/features/shared/lib/rbac";

function campaignSlug(): string {
  return crypto.randomBytes(6).toString("base64url");
}

async function context() {
  const supabase = createServerSupabaseRoute();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("shop_id, role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.shop_id || !getActorCapabilities({ role: profile.role }).canManagePortalQr) return null;
  return { supabase, user, shopId: profile.shop_id };
}

export async function GET() {
  const actor = await context();
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { supabase, user, shopId } = actor;
  let { data: campaign } = await supabase
    .from("portal_enrollment_campaigns")
    .select("id, slug, name, active, allow_booking, scan_count, verified_count")
    .eq("shop_id", shopId)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!campaign) {
    const result = await supabase
      .from("portal_enrollment_campaigns")
      .insert({ shop_id: shopId, slug: campaignSlug(), name: "Front desk", created_by: user.id })
      .select("id, slug, name, active, allow_booking, scan_count, verified_count")
      .single();
    campaign = result.data;
  }

  const { data: shop } = await supabase
    .from("shops")
    .select("name, shop_name")
    .eq("id", shopId)
    .maybeSingle();
  return NextResponse.json({
    ok: true,
    campaign,
    shopName: shop?.shop_name?.trim() || shop?.name?.trim() || "Your shop",
  });
}

export async function PATCH(req: Request) {
  const actor = await context();
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => null)) as
    | { id?: string; name?: string; allowBooking?: boolean; rotate?: boolean }
    | null;
  const id = String(body?.id ?? "").trim();
  if (!id) return NextResponse.json({ error: "Campaign is required." }, { status: 400 });

  const update = {
    ...(typeof body?.name === "string" ? { name: body.name.trim().slice(0, 80) || "Front desk" } : {}),
    ...(typeof body?.allowBooking === "boolean" ? { allow_booking: body.allowBooking } : {}),
    ...(body?.rotate ? { slug: campaignSlug(), rotated_at: new Date().toISOString() } : {}),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await actor.supabase
    .from("portal_enrollment_campaigns")
    .update(update)
    .eq("id", id)
    .eq("shop_id", actor.shopId)
    .select("id, slug, name, active, allow_booking, scan_count, verified_count")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, campaign: data });
}
