export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/features/shared/lib/supabase/admin";

function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  return `${name?.slice(0, 1) || "•"}${"•".repeat(Math.max(4, (name?.length || 1) - 1))}@${domain || ""}`;
}

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token")?.trim() || "";
  if (!token) return NextResponse.json({ error: "Invite not found." }, { status: 404 });
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const { data: invite } = await supabaseAdmin
    .from("fleet_portal_invites")
    .select("id, email, role, expires_at, accepted_at, revoked_at, fleet_id, shop_id")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (!invite || invite.revoked_at || invite.accepted_at || new Date(invite.expires_at) <= new Date()) {
    return NextResponse.json({ error: "This fleet invitation is invalid or expired." }, { status: 404 });
  }
  const [{ data: fleet }, { data: shop }] = await Promise.all([
    supabaseAdmin.from("fleets").select("name").eq("id", invite.fleet_id).maybeSingle(),
    supabaseAdmin.from("shops").select("name, shop_name").eq("id", invite.shop_id).maybeSingle(),
  ]);
  return NextResponse.json({
    ok: true,
    invite: {
      email: maskEmail(invite.email),
      role: invite.role,
      expiresAt: invite.expires_at,
      fleetName: fleet?.name || "Fleet account",
      shopName: shop?.shop_name?.trim() || shop?.name?.trim() || "ProFixIQ shop",
    },
  });
}
