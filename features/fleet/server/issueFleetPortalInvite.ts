import crypto from "node:crypto";
import { supabaseAdmin } from "@/features/shared/lib/supabase/admin";
import { sendPortalInviteEmail } from "@/features/email/server";
import { getActiveBrandForRender } from "@/features/branding/server/getActiveBrandForRender";

function siteUrl(): string {
  const value = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (value) return /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return process.env.NODE_ENV === "production" ? "https://profixiq.com" : "http://localhost:3000";
}

export type FleetInviteRole = "manager" | "approver" | "viewer";

type IssueFleetInviteResult =
  | {
      ok: true;
      expiresAt: string;
      invitationAccepted: true;
      deliveryStatePersisted: boolean;
    }
  | { ok: false; status: number; error: string };

type InviteDelivery =
  | { status: "accepted"; emailLogId: string; acceptedAt: string }
  | { status: "suppressed"; emailLogId: string | null }
  | { status: "failed"; emailLogId: null };

/**
 * Persist the delivery outcome so a failed or suppressed invitation stays
 * visible and retryable after the response that reported it is gone.
 */
export async function recordInviteDelivery(input: {
  inviteId: string;
  shopId: string;
  delivery: InviteDelivery;
}): Promise<boolean> {
  const { inviteId, shopId, delivery } = input;
  if (delivery.status === "accepted") {
    const { data, error } = await supabaseAdmin.rpc(
      "record_fleet_portal_invitation_email_acceptance",
      {
        p_shop_id: shopId,
        p_invite_id: inviteId,
        p_email_log_id: delivery.emailLogId,
        p_accepted_at: delivery.acceptedAt,
      },
    );
    return !error && data === true;
  }

  const { error } = await supabaseAdmin
    .from("fleet_portal_invites")
    .update({
      delivery_status: delivery.status,
      delivery_attempted_at: new Date().toISOString(),
      delivery_error:
        delivery.status === "suppressed"
          ? "Recipient address is suppressed and cannot receive email."
          : "Invitation email could not be accepted by the provider.",
      email_log_id: delivery.emailLogId,
      delivery_reserved_until: null,
    })
    .eq("id", inviteId)
    .eq("shop_id", shopId);
  return !error;
}

/**
 * Deliver an invitation email and report the real outcome.
 *
 * sendDynamicTemplateEmail resolves with { status: "suppressed" } for a
 * suppressed recipient rather than throwing, so awaiting it without inspecting
 * the result silently reports success while the recipient receives nothing.
 */
export async function deliverFleetPortalInvite(input: {
  shopId: string;
  createdBy: string;
  fleetName: string;
  email: string;
  role: FleetInviteRole;
  rawToken: string;
}): Promise<InviteDelivery> {
  const { shopId, createdBy, fleetName, email, role, rawToken } = input;
  try {
    const portalLink = `${siteUrl()}/portal/auth/fleet-invite?token=${encodeURIComponent(rawToken)}`;
    const [{ data: shop }, brand] = await Promise.all([
      supabaseAdmin
        .from("shops")
        .select("name, shop_name")
        .eq("id", shopId)
        .maybeSingle(),
      getActiveBrandForRender(shopId),
    ]);
    const shopName =
      shop?.shop_name?.trim() || shop?.name?.trim() || "ProFixIQ";
    const result = await sendPortalInviteEmail({
      shopId,
      to: email,
      portalLink,
      shopName,
      brandLogoUrl: brand?.logoUrl ?? null,
      brandPrimaryColor: brand?.colors.primary ?? null,
      brandSecondaryColor: brand?.colors.secondary ?? null,
      createdBy,
      portalType: "fleet",
      fleetName,
      fleetRole: role,
    });
    const status = (result as { status?: string } | undefined)?.status;
    const emailLogId = (result as { emailLogId?: unknown } | undefined)
      ?.emailLogId;
    if (status === "suppressed") {
      return {
        status: "suppressed",
        emailLogId: typeof emailLogId === "string" ? emailLogId : null,
      };
    }
    const acceptedAt = (result as { acceptedAt?: unknown } | undefined)
      ?.acceptedAt;
    if (
      status === "accepted" &&
      typeof emailLogId === "string" &&
      typeof acceptedAt === "string"
    ) {
      return { status: "accepted", emailLogId, acceptedAt };
    }
    return { status: "failed", emailLogId: null };
  } catch {
    return { status: "failed", emailLogId: null };
  }
}

/**
 * Canonical Fleet portal invitation issuance uses a transaction-scoped lock and
 * one atomic database operation before delivery. Both Shop and Fleet entry
 * points use the same issuance path to avoid competing valid tokens.
 */
export async function issueFleetPortalInvite(input: {
  shopId: string;
  createdByAuthUserId: string;
  createdByProfileId: string;
  fleet: { id: string; name: string };
  email: string;
  role: FleetInviteRole;
}): Promise<IssueFleetInviteResult> {
  const {
    shopId,
    createdByAuthUserId,
    createdByProfileId,
    fleet,
    email,
    role,
  } = input;

  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  // The database serializes first-time and replacement invitations together.
  // If insertion fails, the prior invitation remains valid.
  const { data, error } = await supabaseAdmin.rpc(
    "issue_fleet_portal_invitation_atomic",
    {
      p_shop_id: shopId,
      p_fleet_id: fleet.id,
      p_email: email,
      p_role: role,
      p_token_hash: tokenHash,
      p_expires_at: expiresAt,
      p_created_by: createdByAuthUserId,
    },
  );
  const invite = Array.isArray(data) ? data[0] : null;
  if (error || !invite?.invite_id) {
    const inProgress = error?.code === "55P03";
    const existingMember = error?.code === "23505";
    return {
      ok: false,
      status: inProgress ? 423 : existingMember ? 409 : 500,
      error: inProgress
        ? "Invitation delivery is in progress. Check its status before retrying."
        : existingMember
          ? "This user already belongs to this Fleet."
          : "Invitation could not be created. The previous invitation was preserved.",
    };
  }

  const delivery = await deliverFleetPortalInvite({
    shopId,
    createdBy: createdByProfileId,
    fleetName: fleet.name,
    email,
    role,
    rawToken,
  });

  const deliveryStatePersisted = await recordInviteDelivery({
    inviteId: invite.id,
    shopId,
    delivery,
  });

  if (delivery.status !== "accepted") {
    const { error: revokeError } = await supabaseAdmin
      .from("fleet_portal_invites")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", invite.id)
      .eq("shop_id", shopId);
    return {
      ok: false,
      status: revokeError ? 500 : 502,
      error: revokeError
        ? "Invitation delivery failed and its recovery state could not be finalized. Reload Fleet access before retrying."
        : delivery.status === "suppressed"
          ? "This address is suppressed and cannot receive email. Use a different fleet contact address."
          : "Invitation email could not be sent. Please try again.",
    };
  }

  return {
    ok: true,
    expiresAt,
    invitationAccepted: true,
    deliveryStatePersisted,
  };
}

