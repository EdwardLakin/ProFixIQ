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
  return process.env.NODE_ENV === "production" ? "https://profixiq.com" : "http://localhost:3000";
}

export async function GET() {
  const access = await requireShopScopedApiAccess({ requiredCapability: "canInviteFleetMembers" });
  if (!access.ok) return access.response;
  const [fleetsResult, invitesResult] = await Promise.all([
    access.supabase.from("fleets").select("id, name").eq("shop_id", access.profile.shop_id).order("name"),
    access.supabase
      .from("fleet_portal_invites")
      .select("id, fleet_id, email, role, expires_at, accepted_at, revoked_at, created_at")
      .eq("shop_id", access.profile.shop_id)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  return NextResponse.json({ ok: true, fleets: fleetsResult.data ?? [], invites: invitesResult.data ?? [] });
}

export async function POST(req: Request) {
  const access = await requireShopScopedApiAccess({ requiredCapability: "canInviteFleetMembers" });
  if (!access.ok) return access.response;
  const body = (await req.json().catch(() => null)) as { fleetId?: string; email?: string; role?: string } | null;
  const fleetId = String(body?.fleetId ?? "").trim();
  const email = String(body?.email ?? "").trim().toLowerCase();
  const role = body?.role === "manager" || body?.role === "approver" ? body.role : "viewer";
  if (!fleetId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Fleet and a valid email are required." }, { status: 400 });
  }

  const { data: fleet } = await access.supabase
    .from("fleets")
    .select("id, name, shop_id")
    .eq("id", fleetId)
    .eq("shop_id", access.profile.shop_id)
    .maybeSingle();
  if (!fleet?.id) return NextResponse.json({ error: "Fleet not found." }, { status: 404 });

  await access.supabase
    .from("fleet_portal_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("fleet_id", fleet.id)
    .eq("email", email)
    .is("accepted_at", null)
    .is("revoked_at", null);

  const rawToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const { error: insertError } = await access.supabase.from("fleet_portal_invites").insert({
    shop_id: access.profile.shop_id,
    fleet_id: fleet.id,
    email,
    role,
    token_hash: tokenHash,
    expires_at: expiresAt,
    created_by: access.profile.id,
  });
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 400 });

  const redirectTo = `${siteUrl()}/portal/auth/fleet-invite?token=${encodeURIComponent(rawToken)}`;
  const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo },
  });
  const actionLink = linkData?.properties?.action_link;
  if (linkError || !actionLink) return NextResponse.json({ error: "Fleet invite link could not be created." }, { status: 500 });

  const [{ data: shop }, brand] = await Promise.all([
    supabaseAdmin.from("shops").select("name, shop_name").eq("id", access.profile.shop_id).maybeSingle(),
    getActiveBrandForRender(access.profile.shop_id),
  ]);
  const shopName = shop?.shop_name?.trim() || shop?.name?.trim() || "ProFixIQ";
  await sendPortalInviteEmail({
    shopId: access.profile.shop_id,
    to: email,
    portalLink: actionLink,
    shopName,
    brandLogoUrl: brand?.logoUrl ?? null,
    brandPrimaryColor: brand?.colors.primary ?? null,
    brandSecondaryColor: brand?.colors.secondary ?? null,
    createdBy: access.profile.id,
    portalType: "fleet",
    fleetName: fleet.name,
    fleetRole: role,
  });

  return NextResponse.json({ ok: true, expiresAt });
}
