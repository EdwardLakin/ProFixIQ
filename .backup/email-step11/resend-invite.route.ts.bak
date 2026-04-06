// app/api/admin/staff-invite-candidates/[id]/resend-invite/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@shared/types/types/supabase";
import {
  createServerSupabaseRoute,
  createAdminSupabase,
} from "@/features/shared/lib/supabase/server";
import sgMail from "@sendgrid/mail";

type DB = Database;

const ADMIN_ROLES = new Set<string>(["owner", "admin", "manager", "advisor"]);

const INVITE_STATUS = {
  pending: "pending",
  invited: "invited",
  created: "created",
  error: "error",
} as const;

type RouteContext = { params: { id: string } };

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") throw new Error(`Missing required env: ${name}`);
  return v;
}

function safeLower(v: string | null | undefined): string {
  return String(v ?? "").trim().toLowerCase();
}

function isValidEmail(v: string): boolean {
  return !!v && v.includes("@");
}

export async function POST(req: NextRequest, context: unknown) {
  void req; // ✅ satisfy “declared but never read” without underscores

  try {
    const { params } = context as RouteContext;
    const candidateId = params?.id;

    if (!candidateId) {
      return NextResponse.json({ error: "Missing candidate id" }, { status: 400 });
    }

    // caller auth
    const supabaseUser = createServerSupabaseRoute();
    const {
      data: { user },
      error: userErr,
    } = await supabaseUser.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data: me, error: meErr } = await supabaseUser
      .from("profiles")
      .select("id, role, shop_id")
      .eq("id", user.id)
      .maybeSingle();

    if (meErr || !me || !me.shop_id) {
      return NextResponse.json({ error: "Profile for current user not found" }, { status: 403 });
    }

    const callerRole = String(me.role ?? "").toLowerCase();
    if (!ADMIN_ROLES.has(callerRole)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminSupabase();

    // load candidate (must be same shop)
    const { data: candidate, error: candErr } = await admin
      .from("staff_invite_candidates")
      .select("*")
      .eq("id", candidateId)
      .eq("shop_id", me.shop_id)
      .maybeSingle();

    if (candErr) return NextResponse.json({ error: candErr.message }, { status: 500 });
    if (!candidate) return NextResponse.json({ error: "Candidate not found" }, { status: 404 });

    // Must already have created user/profile
    if (!candidate.created_user_id || !candidate.created_profile_id) {
      return NextResponse.json(
        { error: "Candidate has no created_user_id yet. Use Create User first." },
        { status: 400 },
      );
    }

    const email = safeLower(candidate.email ?? candidate.email_lc ?? "");
    const username = safeLower(candidate.username ?? candidate.username_lc ?? "");
    const full_name = (candidate.full_name ?? null) || null;

    if (!isValidEmail(email)) {
      await admin
        .from("staff_invite_candidates")
        .update({
          status: INVITE_STATUS.error,
          error: "Missing/invalid email. Cannot resend invite.",
          updated_at: new Date().toISOString(),
          created_by: user.id,
        } as DB["public"]["Tables"]["staff_invite_candidates"]["Update"])
        .eq("id", candidateId);

      return NextResponse.json({ error: "Candidate has no valid email. Fix email first." }, { status: 400 });
    }

    if (!username) {
      await admin
        .from("staff_invite_candidates")
        .update({
          status: INVITE_STATUS.error,
          error: "Missing username. Cannot resend invite.",
          updated_at: new Date().toISOString(),
          created_by: user.id,
        } as DB["public"]["Tables"]["staff_invite_candidates"]["Update"])
        .eq("id", candidateId);

      return NextResponse.json({ error: "Candidate has no username. Fix username first." }, { status: 400 });
    }

    // resend has no temp password (we should not store it)
    const SENDGRID_API_KEY = mustEnv("SENDGRID_API_KEY");
    const TEMPLATE_ID = mustEnv("SENDGRID_USER_INVITE_TEMPLATE_ID");
    const FROM_EMAIL = mustEnv("SENDGRID_FROM_EMAIL");
    const FROM_NAME = process.env.SENDGRID_FROM_NAME ?? "ProFixIQ";
    const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://profixiq.com";

    sgMail.setApiKey(SENDGRID_API_KEY);

    await sgMail.send({
      to: email,
      from: { email: FROM_EMAIL, name: FROM_NAME },
      replyTo: FROM_EMAIL,
      templateId: TEMPLATE_ID,
      dynamicTemplateData: {
        full_name: full_name ?? username,
        username,
        temp_password: null,
        login_url: `${SITE_URL}/login`,
        role: candidate.role ?? "mechanic",
        shop_id: me.shop_id,
        resend: true,
      },
    });

    await admin
      .from("staff_invite_candidates")
      .update({
        status: INVITE_STATUS.invited,
        error: null,
        updated_at: new Date().toISOString(),
        created_by: user.id,
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