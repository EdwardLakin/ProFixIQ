import "server-only";

import crypto from "node:crypto";
import { supabaseAdmin } from "@/features/shared/lib/supabase/admin";
import { sendPortalInviteEmail } from "@/features/email/server";
import { getActiveBrandForRender } from "@/features/branding/server/getActiveBrandForRender";

type InviteSource = "work_order" | "qr" | "customer_account";

export class CustomerPortalInviteDeliveryError extends Error {
  constructor(
    public readonly inviteId: string,
    public readonly inviteCreated: boolean,
  ) {
    super("The portal invitation exists, but email delivery could not be confirmed. Refresh Portal access before retrying.");
    this.name = "CustomerPortalInviteDeliveryError";
  }
}

async function recordCustomerPortalInviteDeliveryFailure(input: {
  shopId: string;
  inviteId: string;
  attemptId: string;
  email: string;
  createdByProfileId?: string | null;
}) {
  const metadata = {
    kind: "portal_invite",
    portal_type: "customer",
    customer_portal_invite_id: input.inviteId,
    customer_portal_invite_attempt_id: input.attemptId,
  };

  try {
    const { data: existingLog, error: lookupError } = await supabaseAdmin
      .from("email_logs")
      .select("id,status")
      .eq("shop_id", input.shopId)
      .eq("template_key", "portal_invite")
      .eq("to_email", input.email)
      .eq("metadata->>customer_portal_invite_attempt_id", input.attemptId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (existingLog?.id) {
      // The sender records a queued row before calling SendGrid. If its own
      // best-effort failure update also failed, reconcile this attempt so it
      // cannot remain "sending" forever. Preserve any concurrent provider event.
      if (existingLog.status === "queued") {
        const { error: updateError } = await supabaseAdmin
          .from("email_logs")
          .update({
            status: "failed",
            error_text: "The invitation email could not be prepared or submitted.",
          })
          .eq("id", existingLog.id)
          .eq("status", "queued");
        if (updateError) throw updateError;
      }
      return;
    }

    const { error: insertError } = await supabaseAdmin.from("email_logs").insert({
      shop_id: input.shopId,
      template_key: "portal_invite",
      template_id: null,
      to_email: input.email,
      subject: "Your ProFixIQ customer portal invitation",
      status: "failed",
      provider: "sendgrid",
      error_text: "The invitation email could not be prepared or submitted.",
      metadata,
      created_by: input.createdByProfileId ?? null,
    });
    if (insertError) throw insertError;
  } catch (error) {
    console.error("[portal/customer-invite] failed to persist delivery outcome", {
      inviteId: input.inviteId,
      error: error instanceof Error ? error.message : "Unknown logging error",
    });
  }
}

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
  /** Canonical profiles.id for email_logs.created_by; auth ID above belongs to the invite row. */
  createdByProfileId?: string | null;
}) {
  const email = input.email.trim().toLowerCase();
  const { data: customer, error: customerError } = await supabaseAdmin
    .from("customers")
    .select("id, shop_id, email, active, merged_into_customer_id")
    .eq("id", input.customerId)
    .eq("shop_id", input.shopId)
    .maybeSingle();

  if (customerError || !customer?.id || customer.email?.trim().toLowerCase() !== email) {
    throw new Error("Customer invite identity could not be verified.");
  }

  if (input.source === "customer_account" && (!customer.active || customer.merged_into_customer_id)) {
    throw new Error("Archived or merged customer accounts cannot receive portal invitations.");
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
  let inviteCreated = false;
  if (inviteId && input.source === "customer_account") {
    // A resend must renew its database acceptance window, not merely its email link.
    // Conditional predicates avoid extending a concurrently accepted or revoked invitation.
    const { data: renewed, error: renewalError } = await supabaseAdmin
      .from("customer_portal_invites")
      .update({ expires_at: new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString() })
      .eq("id", inviteId)
      .eq("shop_id", input.shopId)
      .eq("customer_id", customer.id)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", now.toISOString())
      .select("id")
      .maybeSingle();
    if (renewalError || !renewed?.id) throw new Error("Invitation changed while resending. Reload portal access and retry.");
  }
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
    inviteCreated = true;
  }

  if (!inviteId) throw new Error("Portal invite could not be created.");
  const inviteAttemptId = crypto.randomUUID();
  try {
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

    const delivery = await sendPortalInviteEmail({
      shopId: input.shopId,
      to: email,
      portalLink,
      shopName,
      brandLogoUrl: brand?.logoUrl ?? null,
      brandPrimaryColor: brand?.colors.primary ?? null,
      brandSecondaryColor: brand?.colors.secondary ?? null,
      createdBy: input.createdByProfileId ?? null,
      portalType: "customer",
      customerPortalInviteId: inviteId,
      customerPortalInviteAttemptId: inviteAttemptId,
    });

    return {
      inviteId,
      inviteCreated,
      deliveryStatus: delivery.status,
      ...(delivery.status === "suppressed" ? { deliveryReason: delivery.reason } : {}),
      portalLink,
    };
  } catch {
    await recordCustomerPortalInviteDeliveryFailure({
      shopId: input.shopId,
      inviteId,
      attemptId: inviteAttemptId,
      email,
      createdByProfileId: input.createdByProfileId,
    });
    throw new CustomerPortalInviteDeliveryError(inviteId, inviteCreated);
  }
}
