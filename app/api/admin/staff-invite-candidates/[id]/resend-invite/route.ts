export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@shared/types/types/supabase";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { sendUserInviteEmail } from "@/features/email/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type DB = Database;

const INVITE_STATUS = {
  pending: "pending",
  invited: "invited",
  created: "created",
  error: "error",
} as const;

type RouteContext = { params: { id: string } };

function safeLower(v: string | null | undefined): string {
  return String(v ?? "").trim().toLowerCase();
}

function isValidEmail(v: string): boolean {
  return !!v && v.includes("@");
}

export async function POST(_req: NextRequest, context: unknown) {
  try {
    const { params } = context as RouteContext;
    const candidateId = params?.id;

    if (!candidateId) {
      return NextResponse.json({ error: "Missing candidate id" }, { status: 400 });
    }

    const access = await requireShopScopedApiAccess({
      requiredCapability: "canManageUsers",
      allowRoles: ["owner", "admin"],
    });
    if (!access.ok) return access.response;

    const admin = createAdminSupabase();
    const shopId = access.profile.shop_id;
    if (!shopId) {
      return NextResponse.json({ error: "Profile for current user not found" }, { status: 403 });
    }

    const { data: me } = await access.supabase
      .from("profiles")
      .select("id, full_name, first_name, last_name")
      .eq("id", access.profile.id)
      .maybeSingle();

    const { data: candidate, error: candErr } = await admin
      .from("staff_invite_candidates")
      .select("*")
      .eq("id", candidateId)
      .eq("shop_id", shopId)
      .maybeSingle();

    if (candErr) {
      return NextResponse.json({ error: candErr.message }, { status: 500 });
    }
    if (!candidate) {
      return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
    }

    if (!candidate.created_user_id || !candidate.created_profile_id) {
      return NextResponse.json(
        { error: "Candidate has no created_user_id yet. Use Create User first." },
        { status: 400 },
      );
    }

    const email = safeLower(candidate.email ?? candidate.email_lc ?? "");
    const username = safeLower(candidate.username ?? candidate.username_lc ?? "");
    const fullName = (candidate.full_name ?? null) || null;

    if (!isValidEmail(email)) {
      await admin
        .from("staff_invite_candidates")
        .update({
          status: INVITE_STATUS.error,
          error: "Missing/invalid email. Cannot resend invite.",
          updated_at: new Date().toISOString(),
          created_by: access.profile.id,
        } as DB["public"]["Tables"]["staff_invite_candidates"]["Update"])
        .eq("id", candidateId);

      return NextResponse.json(
        { error: "Candidate has no valid email. Fix email first." },
        { status: 400 },
      );
    }

    if (!username) {
      await admin
        .from("staff_invite_candidates")
        .update({
          status: INVITE_STATUS.error,
          error: "Missing username. Cannot resend invite.",
          updated_at: new Date().toISOString(),
          created_by: access.profile.id,
        } as DB["public"]["Tables"]["staff_invite_candidates"]["Update"])
        .eq("id", candidateId);

      return NextResponse.json(
        { error: "Candidate has no username. Fix username first." },
        { status: 400 },
      );
    }

    const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://profixiq.com";

    const { data: shop } = await admin
      .from("shops")
      .select("shop_name, name")
      .eq("id", shopId)
      .maybeSingle<{ shop_name: string | null; name: string | null }>();

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
      loginUrl: `${SITE_URL}/login`,
      username,
      tempPassword: null,
      role: candidate.role ?? "mechanic",
      shopName,
      inviterName,
      fullName: fullName ?? username,
      resend: true,
      createdBy: access.profile.id,
    });

    await admin
      .from("staff_invite_candidates")
      .update({
        status: INVITE_STATUS.invited,
        error: null,
        updated_at: new Date().toISOString(),
        created_by: access.profile.id,
        email_lc: email,
        username_lc: username,
      } as DB["public"]["Tables"]["staff_invite_candidates"]["Update"])
      .eq("id", candidateId);

    return NextResponse.json({ ok: true, status: INVITE_STATUS.invited });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
