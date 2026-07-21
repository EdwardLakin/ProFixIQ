import "server-only";

import crypto from "node:crypto";
import { supabaseAdmin } from "@/features/shared/lib/supabase/admin";
import { sendPortalInviteEmail } from "@/features/email/server";
import { getActiveBrandForRender } from "@/features/branding/server/getActiveBrandForRender";

type InviteSource = "work_order" | "qr";

function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (configured) return /^https?:\/\//i.test(configured) ? configured : `https://${configured}`;
  if (process.env.VERCEL_URL?.trim()) return `https://${process.env.VERCEL_URL.trim()}`;
  return process.env.NODE_ENV === "production" ? "https://profixiq.com" : "http://localhost:3000";
}

export async function issueCustomerPortalInvite(input: {
  shopId: string;
  customerId: string;
  email: string;
  source: InviteSource;
  workOrderId?: string | null;
  enrollmentCampaignId?: string | null;
  createdBy?: string | null;
}) {
  const email = input.email.trim().toLowerCase();
  const { data: customer, error: customerError } = await supabaseAdmin
    .from("customers")
    .select("id, shop_id, email")
    .eq("id", input.customerId)
    .eq("shop_id", input.shopId)
    .maybeSingle();

  if (customerError || !customer?.id || customer.email?.trim().toLowerCase() !== email) {
    throw new Error("Customer invite identity could not be verified.");
  }

  if (input.workOrderId) {
    const { data: workOrder } = await supabaseAdmin
      .from("work_orders")
      .select("id")
      .eq("id", input.workOrderId)
      .eq("shop_id", input.shopId)
      .eq("customer_id", customer.id)
      .maybeSingle();
    if (!workOrder?.id) throw new Error("Work order does not belong to this customer.");
  }

  const now = new Date();
  const { data: existingInvite } = await supabaseAdmin
    .from("customer_portal_invites")
    .select("id")
    .eq("customer_id", customer.id)
    .eq("email", email)
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", now.toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let inviteId = existingInvite?.id ?? null;
  if (!inviteId) {
    const { data: createdInvite, error: inviteError } = await supabaseAdmin
      .from("customer_portal_invites")
      .insert({
        customer_id: customer.id,
        shop_id: input.shopId,
        work_order_id: input.workOrderId ?? null,
        enrollment_campaign_id: input.enrollmentCampaignId ?? null,
        email,
        source: input.source,
        token: crypto.randomUUID(),
        expires_at: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        created_by: input.createdBy ?? null,
      })
      .select("id")
      .single();
    if (inviteError || !createdInvite?.id) throw new Error("Portal invite could not be created.");
    inviteId = createdInvite.id;
  }

  const portalDestination = input.workOrderId
    ? `/portal/work-orders/view/${input.workOrderId}`
    : "/portal";
  const afterAccept = `/auth/set-password?${new URLSearchParams({
    mode: "portal",
    redirect: portalDestination,
  }).toString()}`;
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  const tokenHash = linkData?.properties?.hashed_token?.trim();
  const verificationType = linkData?.properties?.verification_type;
  if (linkError || !tokenHash || verificationType !== "magiclink") {
    throw new Error("Portal activation link could not be created.");
  }

  const portalLink = `${siteUrl()}/portal/auth/activate?${new URLSearchParams({
    token_hash: tokenHash,
    type: verificationType,
    invite: inviteId,
    next: afterAccept,
  }).toString()}`;

  const [{ data: shop }, brand] = await Promise.all([
    supabaseAdmin
      .from("shops")
      .select("name, shop_name")
      .eq("id", input.shopId)
      .maybeSingle(),
    getActiveBrandForRender(input.shopId),
  ]);
  const shopName = shop?.shop_name?.trim() || shop?.name?.trim() || "ProFixIQ";

  await sendPortalInviteEmail({
    shopId: input.shopId,
    to: email,
    portalLink,
    shopName,
    brandLogoUrl: brand?.logoUrl ?? null,
    brandPrimaryColor: brand?.colors.primary ?? null,
    brandSecondaryColor: brand?.colors.secondary ?? null,
    createdBy: input.createdBy ?? null,
    portalType: "customer",
  });

  return { inviteId, portalLink };
}
