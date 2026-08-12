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
        "id, fleet_id, email, role, expires_at, accepted_at, revoked_at, created_at",
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
    if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
      return NextResponse.json(
        { error: "Enter a valid fleet contact email." },
        { status: 400 },
      );
    }

    const { data: fleet, error } = await supabaseAdmin
      .from("fleets")
      .insert({
        shop_id: access.profile.shop_id,
        ...(customerId ? { customer_id: customerId } : {}),
        name,
        contact_name: contactName || null,
        contact_email: contactEmail || null,
        notes: null,
      })
      .select("id, name")
      .single();

    if (error || !fleet) {
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

    return NextResponse.json({ ok: true, fleet }, { status: 201 });
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

  const { error: revokeError } = await supabaseAdmin
    .from("fleet_portal_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("shop_id", access.profile.shop_id)
    .eq("fleet_id", fleet.id)
    .eq("email", email)
    .is("accepted_at", null)
    .is("revoked_at", null);
  if (revokeError) {
    return NextResponse.json(
      { error: "Invitation could not be prepared." },
      { status: 500 },
    );
  }

  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(
    Date.now() + 14 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data: invite, error: insertError } = await supabaseAdmin
    .from("fleet_portal_invites")
    .insert({
      shop_id: access.profile.shop_id,
      fleet_id: fleet.id,
      email,
      role,
      token_hash: tokenHash,
      expires_at: expiresAt,
      created_by: access.profile.id,
    })
    .select("id")
    .single();
  if (insertError || !invite) {
    return NextResponse.json(
      { error: "Invitation could not be created." },
      { status: 400 },
    );
  }

  const portalLink = `${siteUrl()}/portal/auth/fleet-invite?token=${encodeURIComponent(rawToken)}`;
  const [{ data: shop }, brand] = await Promise.all([
    supabaseAdmin
      .from("shops")
      .select("name, shop_name")
      .eq("id", access.profile.shop_id)
      .maybeSingle(),
    getActiveBrandForRender(access.profile.shop_id),
  ]);
  const shopName = shop?.shop_name?.trim() || shop?.name?.trim() || "ProFixIQ";
  try {
    await sendPortalInviteEmail({
      shopId: access.profile.shop_id,
      to: email,
      portalLink,
      shopName,
      brandLogoUrl: brand?.logoUrl ?? null,
      brandPrimaryColor: brand?.colors.primary ?? null,
      brandSecondaryColor: brand?.colors.secondary ?? null,
      createdBy: access.profile.id,
      portalType: "fleet",
      fleetName: fleet.name,
      fleetRole: role,
    });
  } catch {
    await supabaseAdmin
      .from("fleet_portal_invites")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", invite.id)
      .eq("shop_id", access.profile.shop_id);
    return NextResponse.json(
      { error: "Invitation email could not be sent. Please try again." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, expiresAt });
}
