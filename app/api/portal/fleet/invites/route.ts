export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { supabaseAdmin } from "@/features/shared/lib/supabase/admin";
import { sendPortalInviteEmail } from "@/features/email/server";
import { getActiveBrandForRender } from "@/features/branding/server/getActiveBrandForRender";

function siteUrl(): string {
  const value = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (value) return /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return process.env.NODE_ENV === "production"
    ? "https://profixiq.com"
    : "http://localhost:3000";
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FleetInviteRole = "manager" | "approver" | "viewer";

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
async function recordInviteDelivery(input: {
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
async function deliverFleetPortalInvite(input: {
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
 * Canonical Fleet portal invitation issuance: revoke any pending invite for the
 * same fleet/email, persist a hashed token, then deliver the branded email.
 * Delivery failure revokes the invite so no unreachable token is left behind.
 */
async function issueFleetPortalInvite(input: {
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

  const { error: revokeError } = await supabaseAdmin
    .from("fleet_portal_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("shop_id", shopId)
    .eq("fleet_id", fleet.id)
    .eq("email", email)
    .is("accepted_at", null)
    .is("revoked_at", null);
  if (revokeError) {
    return {
      ok: false,
      status: 500,
      error: "Invitation could not be prepared.",
    };
  }

  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(
    Date.now() + 14 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data: invite, error: insertError } = await supabaseAdmin
    .from("fleet_portal_invites")
    .insert({
      shop_id: shopId,
      fleet_id: fleet.id,
      email,
      role,
      token_hash: tokenHash,
      expires_at: expiresAt,
      created_by: createdByAuthUserId,
      delivery_status: "sending",
      delivery_reserved_until: new Date(
        Date.now() + 15 * 60 * 1000,
      ).toISOString(),
    })
    .select("id")
    .single();
  if (insertError || !invite) {
    return {
      ok: false,
      status: 400,
      error: "Invitation could not be created.",
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

export async function GET(req: Request) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canInviteFleetMembers",
  });
  if (!access.ok) return access.response;
  const [fleetsResult, invitesResult] = await Promise.all([
    supabaseAdmin
      .from("fleets")
      .select("id, name, customer_id")
      .eq("shop_id", access.profile.shop_id)
      .order("name"),
    supabaseAdmin
      .from("fleet_portal_invites")
      .select(
        "id, fleet_id, email, role, expires_at, accepted_at, revoked_at, created_at, delivery_status, delivery_attempted_at, delivery_reserved_until",
      )
      .eq("shop_id", access.profile.shop_id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  if (fleetsResult.error || invitesResult.error) {
    return NextResponse.json(
      { error: "Fleet portal access could not be loaded." },
      { status: 500 },
    );
  }

  const customerId = new URL(req.url).searchParams.get("customerId")?.trim();
  if (customerId && !UUID_PATTERN.test(customerId)) {
    return NextResponse.json(
      { error: "Customer reference is invalid." },
      { status: 400 },
    );
  }
  const customerCandidate = customerId
    ? await supabaseAdmin
        .from("customers")
        .select(
          "id, name, business_name, first_name, last_name, email, account_type",
        )
        .eq("id", customerId)
        .eq("shop_id", access.profile.shop_id)
        .maybeSingle()
    : null;
  if (customerCandidate?.error) {
    return NextResponse.json(
      { error: "Customer relationship could not be loaded." },
      { status: 500 },
    );
  }
  if (customerId && !customerCandidate?.data) {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    fleets: fleetsResult.data ?? [],
    invites: invitesResult.data ?? [],
    customerCandidate: customerCandidate?.data ?? null,
  });
}

export async function POST(req: Request) {
  const access = await requireShopScopedApiAccess({
    requiredCapability: "canInviteFleetMembers",
  });
  if (!access.ok) return access.response;
  const body = (await req.json().catch(() => null)) as {
    action?: string;
    fleetId?: string;
    inviteId?: string;
    email?: string;
    role?: string;
    name?: string;
    contactName?: string;
    contactEmail?: string;
    customerId?: string;
  } | null;

  if (body?.action === "create_fleet") {
    const customerId = String(body.customerId ?? "").trim();
    if (customerId && !UUID_PATTERN.test(customerId)) {
      return NextResponse.json(
        { error: "Customer reference is invalid." },
        { status: 400 },
      );
    }

    const customerResult = customerId
      ? await supabaseAdmin
          .from("customers")
          .select("id, name, business_name, first_name, last_name, email")
          .eq("id", customerId)
          .eq("shop_id", access.profile.shop_id)
          .maybeSingle()
      : null;
    if (customerResult?.error) {
      return NextResponse.json(
        { error: "Customer relationship could not be verified." },
        { status: 500 },
      );
    }
    if (customerId && !customerResult?.data) {
      return NextResponse.json(
        { error: "Customer not found." },
        { status: 404 },
      );
    }

    const customer = customerResult?.data ?? null;
    const name =
      String(body.name ?? "").trim() ||
      customer?.business_name?.trim() ||
      customer?.name?.trim() ||
      "";
    const contactName =
      String(body.contactName ?? "").trim() ||
      [customer?.first_name, customer?.last_name].filter(Boolean).join(" ");
    const contactEmail = String(body.contactEmail ?? customer?.email ?? "")
      .trim()
      .toLowerCase();
    if (!name || name.length > 120) {
      return NextResponse.json(
        {
          error: "Fleet name is required and must be 120 characters or fewer.",
        },
        { status: 400 },
      );
    }
    // A Fleet must never exist without a usable first-owner path, so the
    // contact email that receives the owning manager invitation is required.
    if (!contactEmail) {
      return NextResponse.json(
        {
          error:
            "A fleet contact email is required so the Fleet owner receives portal access.",
        },
        { status: 400 },
      );
    }
    if (!EMAIL_PATTERN.test(contactEmail)) {
      return NextResponse.json(
        { error: "Enter a valid fleet contact email." },
        { status: 400 },
      );
    }

    // Create the Fleet and its owning invitation in one statement boundary.
    // The Fleet insert fires ensure_fleet_customer_account, which creates or
    // mutates a customers row, so a compensating delete afterwards cannot
    // restore the prior state — the two rows must be written together.
    const rawToken = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");
    const expiresAt = new Date(
      Date.now() + 14 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { data: rpcData, error } = await supabaseAdmin.rpc(
      "create_fleet_with_owner_invitation_atomic",
      {
        p_shop_id: access.profile.shop_id,
        p_name: name,
        p_contact_name: contactName,
        p_contact_email: contactEmail,
        p_token_hash: tokenHash,
        p_expires_at: expiresAt,
        p_created_by: access.authUserId,
        ...(customerId ? { p_customer_id: customerId } : {}),
      },
    );
    const createdRow = Array.isArray(rpcData)
      ? (rpcData[0] as
          | { fleet_id?: string; fleet_name?: string; invite_id?: string }
          | undefined)
      : null;
    const created =
      createdRow?.fleet_id && createdRow.fleet_name
        ? {
            fleet_id: createdRow.fleet_id,
            fleet_name: createdRow.fleet_name,
            invite_id: createdRow.invite_id ?? null,
          }
        : null;

    if (error || !created) {
      const duplicate = error?.code === "23505";
      return NextResponse.json(
        {
          error: duplicate
            ? "A Fleet relationship with this name already exists."
            : "Fleet relationship could not be created.",
        },
        { status: duplicate ? 409 : 400 },
      );
    }

    const fleet = { id: created.fleet_id, name: created.fleet_name };

    // Delivery cannot join the transaction. The durable invitation is the
    // access path, so a delivery failure is reported without discarding it —
    // staff resend against the existing invitation rather than recreating the
    // Fleet, which is no longer possible under the unique name index.
    const delivery = await deliverFleetPortalInvite({
      shopId: access.profile.shop_id,
      createdBy: access.profile.id,
      fleetName: fleet.name,
      email: contactEmail,
      role: "manager",
      rawToken,
    });

    const deliveryStatePersisted = created.invite_id
      ? await recordInviteDelivery({
          inviteId: created.invite_id,
          shopId: access.profile.shop_id,
          delivery,
        })
      : false;

    return NextResponse.json(
      {
        ok: true,
        fleet,
        invitedEmail: contactEmail,
        expiresAt,
        inviteId: created.invite_id,
        invitationAccepted: delivery.status === "accepted",
        invitationDelivered: false,
        deliveryStatePersisted,
        ...(delivery.status === "accepted"
          ? {}
          : { deliveryIssue: delivery.status }),
      },
      { status: 201 },
    );
  }

  // Resend an existing invitation, preserving its recipient and role. Token
  // replacement happens under a row lock in the database so two concurrent
  // requests cannot both send valid-looking emails with competing tokens.
  if (body?.action === "resend_invite") {
    const inviteId = String(body.inviteId ?? "").trim();
    if (!inviteId || !UUID_PATTERN.test(inviteId)) {
      return NextResponse.json(
        { error: "Invitation reference is invalid." },
        { status: 400 },
      );
    }

    const rawToken = crypto.randomBytes(32).toString("base64url");
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");
    const expiresAt = new Date(
      Date.now() + 14 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const { data: rpcData, error: replaceError } = await supabaseAdmin.rpc(
      "replace_fleet_portal_invitation_atomic",
      {
        p_shop_id: access.profile.shop_id,
        p_invite_id: inviteId,
        p_token_hash: tokenHash,
        p_expires_at: expiresAt,
        p_created_by: access.authUserId,
      },
    );
    const replacement = Array.isArray(rpcData)
      ? (rpcData[0] as
          | {
              invite_id: string;
              fleet_id: string;
              fleet_name: string;
              invite_email: string;
              invite_role: string;
            }
          | undefined)
      : null;
    if (replaceError || !replacement) {
      const notFound = replaceError?.code === "P0002";
      const inProgress = replaceError?.code === "55P03";
      return NextResponse.json(
        {
          error: notFound
            ? "Invitation not found."
            : inProgress
              ? "Invitation delivery is still in progress. Reload Fleet access before retrying."
              : "This invitation has already been accepted or replaced. Reload Fleet access before retrying.",
        },
        { status: notFound ? 404 : inProgress ? 423 : 409 },
      );
    }

    const role = replacement.invite_role as FleetInviteRole;
    const delivery = await deliverFleetPortalInvite({
      shopId: access.profile.shop_id,
      createdBy: access.profile.id,
      fleetName: replacement.fleet_name,
      email: replacement.invite_email,
      role,
      rawToken,
    });
    const deliveryStatePersisted = await recordInviteDelivery({
      inviteId: replacement.invite_id,
      shopId: access.profile.shop_id,
      delivery,
    });

    return NextResponse.json({
      ok: true,
      expiresAt,
      email: replacement.invite_email,
      role,
      invitationAccepted: delivery.status === "accepted",
      invitationDelivered: false,
      deliveryStatePersisted,
      ...(delivery.status === "accepted"
        ? {}
        : { deliveryIssue: delivery.status }),
    });
  }

  const fleetId = String(body?.fleetId ?? "").trim();
  const email = String(body?.email ?? "")
    .trim()
    .toLowerCase();
  const role =
    body?.role === "manager" || body?.role === "approver"
      ? body.role
      : "viewer";
  if (!fleetId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "Fleet and a valid email are required." },
      { status: 400 },
    );
  }

  const { data: fleet } = await supabaseAdmin
    .from("fleets")
    .select("id, name, shop_id")
    .eq("id", fleetId)
    .eq("shop_id", access.profile.shop_id)
    .maybeSingle();
  if (!fleet?.id)
    return NextResponse.json({ error: "Fleet not found." }, { status: 404 });

  const issued = await issueFleetPortalInvite({
    shopId: access.profile.shop_id,
    createdByAuthUserId: access.authUserId,
    createdByProfileId: access.profile.id,
    fleet: { id: fleet.id, name: fleet.name },
    email,
    role,
  });

  if (!issued.ok) {
    return NextResponse.json(
      { error: issued.error },
      { status: issued.status },
    );
  }

  return NextResponse.json({
    ok: true,
    expiresAt: issued.expiresAt,
    invitationAccepted: issued.invitationAccepted,
    invitationDelivered: false,
    deliveryStatePersisted: issued.deliveryStatePersisted,
  });
}
