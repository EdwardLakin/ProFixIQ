export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/features/shared/lib/supabase/admin";
import { enforceAuthRateLimit } from "@/features/auth/server/authRateLimit";
import { issueCustomerPortalInvite } from "@/features/portal/server/customerPortalInvites";

type Body = { campaignSlug?: string; email?: string };
const GENERIC_MESSAGE = "If the details are valid, we sent a portal activation email.";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  const campaignSlug = String(body?.campaignSlug ?? "").trim();
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!campaignSlug || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
  }

  const rateLimit = enforceAuthRateLimit(req, `portal-enrollment:${campaignSlug}`, email, {
    max: 3,
    windowMs: 15 * 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { ok: false, error: "Please wait before requesting another activation email." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  const { data: campaign } = await supabaseAdmin
    .from("portal_enrollment_campaigns")
    .select("id, shop_id")
    .eq("slug", campaignSlug)
    .eq("active", true)
    .maybeSingle();
  if (!campaign?.id || !campaign.shop_id) {
    return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
  }

  const { data: existingCustomer } = await supabaseAdmin
    .from("customers")
    .select("id")
    .eq("shop_id", campaign.shop_id)
    .ilike("email", email)
    .limit(1)
    .maybeSingle();

  let customerId = existingCustomer?.id ?? null;
  if (!customerId) {
    const { data: createdCustomer, error } = await supabaseAdmin
      .from("customers")
      .insert({ shop_id: campaign.shop_id, email, user_id: null })
      .select("id")
      .single();
    if (error || !createdCustomer?.id) {
      return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
    }
    customerId = createdCustomer.id;
  }

  try {
    await issueCustomerPortalInvite({
      shopId: campaign.shop_id,
      customerId,
      email,
      source: "qr",
      enrollmentCampaignId: campaign.id,
    });
  } catch {
    // Public enrollment deliberately returns the same response for existing,
    // missing, suppressed, and temporarily unavailable identities.
  }

  return NextResponse.json({ ok: true, message: GENERIC_MESSAGE });
}
