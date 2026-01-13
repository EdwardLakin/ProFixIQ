// app/api/admin/staff-invite-candidates/[id]/create-user/route.ts
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

// ✅ Canonical invite statuses (status is TEXT in DB)
const INVITE_STATUS = {
  pending: "pending",
  invited: "invited", // ✅ user created + email sent
  created: "created", // user created but email send failed / skipped
  error: "error",
} as const;

type InviteStatus = (typeof INVITE_STATUS)[keyof typeof INVITE_STATUS];

type RouteContext = { params: { id: string } };

type Body = {
  password: string;
  // Optional overrides from UI (if you edit inline)
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  username?: string | null;
  role?: DB["public"]["Enums"]["user_role_enum"] | null;
};

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
  try {
    const { params } = context as RouteContext;
    const candidateId = params?.id;

    if (!candidateId) {
      return NextResponse.json({ error: "Missing candidate id" }, { status: 400 });
    }

    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

    const password = (body.password ?? "").trim();
    if (!password) {
      return NextResponse.json({ error: "Password is required." }, { status: 400 });
    }

    // caller auth (tenant-safe)
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

    // load candidate (must be pending + same shop)
    const { data: candidate, error: candErr } = await admin
      .from("staff_invite_candidates")
      .select("*")
      .eq("id", candidateId)
      .eq("shop_id", me.shop_id)
      .eq("status", INVITE_STATUS.pending)
      .maybeSingle();

    if (candErr) {
      return NextResponse.json({ error: candErr.message }, { status: 500 });
    }

    if (!candidate) {
      return NextResponse.json({ error: "Pending candidate not found" }, { status: 404 });
    }

    // merge candidate + overrides from UI
    const full_name = (body.full_name ?? candidate.full_name ?? null) || null;
    const phone = (body.phone ?? candidate.phone ?? null) || null;

    const username = safeLower(body.username ?? candidate.username ?? "");
    const email = safeLower(body.email ?? candidate.email ?? "");

    const role = (body.role ?? candidate.role ?? null) as DB["public"]["Enums"]["user_role_enum"] | null;

    // invite email requires email
    if (!isValidEmail(email)) {
      await admin
        .from("staff_invite_candidates")
        .update({
          status: INVITE_STATUS.error as InviteStatus,
          error: "Missing/invalid email. Cannot send invite.",
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
          status: INVITE_STATUS.error as InviteStatus,
          error: "Missing username. Cannot create account.",
          updated_at: new Date().toISOString(),
          created_by: user.id,
        } as DB["public"]["Tables"]["staff_invite_candidates"]["Update"])
        .eq("id", candidateId);

      return NextResponse.json({ error: "Candidate has no username. Fix username first." }, { status: 400 });
    }

    // ensure username unique
    const { data: existingProfile, error: existingErr } = await admin
      .from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle<{ id: string }>();

    if (existingErr) {
      return NextResponse.json({ error: existingErr.message }, { status: 500 });
    }
    if (existingProfile?.id) {
      await admin
        .from("staff_invite_candidates")
        .update({
          status: INVITE_STATUS.error as InviteStatus,
          error: `Username already exists: ${username}`,
          updated_at: new Date().toISOString(),
          created_by: user.id,
        } as DB["public"]["Tables"]["staff_invite_candidates"]["Update"])
        .eq("id", candidateId);

      return NextResponse.json({ error: "Username already exists in profiles." }, { status: 400 });
    }

    // create auth user
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name,
        phone,
        role,
        shop_id: me.shop_id,
        username,
      },
    });

    if (createErr || !created?.user) {
      await admin
        .from("staff_invite_candidates")
        .update({
          status: INVITE_STATUS.error as InviteStatus,
          error: createErr?.message ?? "Auth create failed",
          updated_at: new Date().toISOString(),
          created_by: user.id,
        } as DB["public"]["Tables"]["staff_invite_candidates"]["Update"])
        .eq("id", candidateId);

      return NextResponse.json({ error: createErr?.message ?? "Failed to create auth user" }, { status: 400 });
    }

    const newUserId = created.user.id;

    // upsert profile row
    const { error: profileErr } = await admin
      .from("profiles")
      .upsert(
        {
          id: newUserId,
          email,
          full_name,
          phone,
          role,
          shop_id: me.shop_id,
          username,
          must_change_password: true,
          updated_at: new Date().toISOString(),
        } as DB["public"]["Tables"]["profiles"]["Insert"],
        { onConflict: "id" },
      );

    if (profileErr) {
      await admin
        .from("staff_invite_candidates")
        .update({
          status: INVITE_STATUS.error as InviteStatus,
          error: `Profile upsert failed: ${profileErr.message}`,
          updated_at: new Date().toISOString(),
          created_by: user.id,
          created_user_id: newUserId,
          created_profile_id: newUserId,
        } as DB["public"]["Tables"]["staff_invite_candidates"]["Update"])
        .eq("id", candidateId);

      return NextResponse.json({ error: profileErr.message }, { status: 400 });
    }

    // send email invite (SendGrid template)
    const SENDGRID_API_KEY = mustEnv("SENDGRID_API_KEY");
    const TEMPLATE_ID = mustEnv("SENDGRID_STAFF_INVITE_TEMPLATE_ID");
    const FROM_EMAIL = mustEnv("SENDGRID_FROM_EMAIL");
    const FROM_NAME = process.env.SENDGRID_FROM_NAME ?? "ProFixIQ";
    const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://profixiq.com";

    sgMail.setApiKey(SENDGRID_API_KEY);

    let finalStatus: InviteStatus = INVITE_STATUS.invited;
    let sendErrMsg: string | null = null;

    try {
      await sgMail.send({
        to: email,
        from: { email: FROM_EMAIL, name: FROM_NAME },
        replyTo: FROM_EMAIL,
        templateId: TEMPLATE_ID,
        dynamicTemplateData: {
          full_name: full_name ?? username,
          username,
          temp_password: password,
          login_url: `${SITE_URL}/login`,
          role: role ?? "mechanic",
          shop_id: me.shop_id,
          resend: false,
        },
      });
    } catch (e) {
      finalStatus = INVITE_STATUS.created;
      sendErrMsg = e instanceof Error ? e.message : "SendGrid send failed";
      console.warn("[staff invite] sendgrid failed", e);
    }

    // update candidate status
    await admin
      .from("staff_invite_candidates")
      .update({
        status: finalStatus,
        error: sendErrMsg,
        updated_at: new Date().toISOString(),
        created_by: user.id,
        created_user_id: newUserId,
        created_profile_id: newUserId,
        email_lc: email,
        username_lc: username,
      } as DB["public"]["Tables"]["staff_invite_candidates"]["Update"])
      .eq("id", candidateId);

    return NextResponse.json({
      ok: true,
      user_id: newUserId,
      status: finalStatus,
      ...(sendErrMsg ? { warning: "User created but invite failed to send", send_error: sendErrMsg } : {}),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}