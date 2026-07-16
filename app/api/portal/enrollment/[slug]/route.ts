export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/features/shared/lib/supabase/admin";
import { getActiveBrandForRender } from "@/features/branding/server/getActiveBrandForRender";

export async function GET(_: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params;
  const { data: campaign } = await supabaseAdmin
    .from("portal_enrollment_campaigns")
    .select("id, shop_id, name, allow_booking")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();
  if (!campaign?.id) return NextResponse.json({ error: "Enrollment link not found." }, { status: 404 });

  await supabaseAdmin.rpc("record_portal_enrollment_scan" as never, { p_slug: slug } as never);
  const [{ data: shop }, brand] = await Promise.all([
    supabaseAdmin
      .from("shops")
      .select("name, shop_name, logo_url")
      .eq("id", campaign.shop_id)
      .maybeSingle(),
    getActiveBrandForRender(campaign.shop_id),
  ]);

  return NextResponse.json({
    ok: true,
    campaign: { name: campaign.name, allowBooking: campaign.allow_booking },
    shop: {
      name: shop?.shop_name?.trim() || shop?.name?.trim() || "ProFixIQ Service Center",
      logoUrl: brand?.logoUrl || shop?.logo_url || null,
      primaryColor: brand?.colors.primary || null,
    },
  });
}
