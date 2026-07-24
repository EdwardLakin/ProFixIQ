export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { sendUserInviteEmail } from "@/features/email/server";

type RouteContext = { params: { id: string } };

type UserInviteTarget = {
  id: string;
  shop_id: string | null;
  email: string | null;
  username: string | null;
  full_name: string | null;
  role: string | null;
};

function validEmail(value: string | null | undefined): string | null {
  const email = String(value ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) return null;
  return email;
}

export async function POST(_req: NextRequest, context: unknown) {
  const { params } = context as RouteContext;
  const id = params?.id;

  if (!id) {
    return NextResponse.json({ error: "Missing user id" }, { status: 400 });
  }

  const access = await requireShopScopedApiAccess({
    requiredCapability: "canManageUsers",
    allowRoles: ["owner", "admin"],
  });
  if (!access.ok) return access.response;

  const shopId = access.profile.shop_id;
  if (!shopId) {
    return NextResponse.json({ error: "Profile for current user not found" }, { status: 403 });
  }

  const admin = createAdminSupabase();

  const { data: target, error: targetErr } = await admin
    .from("profiles")
    .select("id, shop_id, email, username, full_name, role")
    .eq("id", id)
    .maybeSingle<UserInviteTarget>();

  if (targetErr) {
    return NextResponse.json({ error: targetErr.message }, { status: 500 });
  }
  if (!target || target.shop_id !== shopId) {
    return NextResponse.json({ error: "Target user not found in your shop" }, { status: 404 });
  }

  const email = validEmail(target.email);
  if (!email) {
    return NextResponse.json({ error: "This user has no valid contact email." }, { status: 400 });
  }

  const username = String(target.username ?? "").trim();
  if (!username) {
    return NextResponse.json({ error: "This user has no username to include in the invite." }, { status: 400 });
  }

  const { data: me } = await access.supabase
    .from("profiles")
    .select("id, full_name, first_name, last_name")
    .eq("id", access.profile.id)
    .maybeSingle<{
      id: string;
      full_name: string | null;
      first_name: string | null;
      last_name: string | null;
    }>();

  const { data: shop } = await admin
    .from("shops")
    .select("shop_name, name")
    .eq("id", shopId)
    .maybeSingle<{ shop_name: string | null; name: string | null }>();

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://profixiq.com";
  const shopName =
    (shop?.shop_name ?? "").trim() ||
    (shop?.name ?? "").trim() ||
    "ProFixIQ";
  const inviterName =
    String(me?.full_name ?? "").trim() ||
    [String(me?.first_name ?? "").trim(), String(me?.last_name ?? "").trim()]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    "ProFixIQ";

  await sendUserInviteEmail({
    shopId,
    to: email,
    loginUrl: `${siteUrl}/login`,
    username,
    tempPassword: null,
    role: target.role ?? "mechanic",
    shopName,
    inviterName,
    fullName: target.full_name ?? username,
    resend: true,
    createdBy: access.profile.id,
  });

  return NextResponse.json({ ok: true, invite_email_sent: true, email });
}
