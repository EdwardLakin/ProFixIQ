export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@shared/types/types/supabase";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { sendUserInviteEmail } from "@/features/email/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { assertShopHasAvailableSeat } from "@/features/shared/lib/server/shop-seat-limit";

type DB = Database;

const INVITE_STATUS = {
  pending: "pending",
  invited: "invited",
  created: "created",
  error: "error",
} as const;

type InviteStatus = (typeof INVITE_STATUS)[keyof typeof INVITE_STATUS];
type RouteContext = { params: { id: string } };

function safeLower(v: string | null | undefined): string {
  return String(v ?? "").trim().toLowerCase();
}

function isValidEmail(v: string): boolean {
  return !!v && v.includes("@");
}

function makeTempPassword(length = 12): string {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
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

    const email = safeLower(candidate.email ?? candidate.email_lc ?? "");
    const username = safeLower(candidate.username ?? candidate.username_lc ?? "");
    const fullName = (candidate.full_name ?? null) || null;

    if (!isValidEmail(email)) {
      await admin
        .from("staff_invite_candidates")
        .update({
          status: INVITE_STATUS.error,
          error: "Missing/invalid email. Cannot send invite.",
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
          error: "Missing username. Cannot send invite.",
          updated_at: new Date().toISOString(),
          created_by: access.profile.id,
        } as DB["public"]["Tables"]["staff_invite_candidates"]["Update"])
        .eq("id", candidateId);

      return NextResponse.json(
        { error: "Candidate has no username. Fix username first." },
        { status: 400 },
      );
    }

    if (candidate.created_user_id && candidate.created_profile_id) {
      return NextResponse.json(
        { error: "User already created for this candidate. Use resend invite." },
        { status: 400 },
      );
    }

    try {
      await assertShopHasAvailableSeat(admin, shopId);
    } catch (seatErr) {
      const msg = seatErr instanceof Error ? seatErr.message : "Shop user limit reached for your current plan.";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const tempPassword = makeTempPassword(14);

    const { data: createdUser, error: createUserErr } =
      await admin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          username,
          full_name: fullName ?? username,
        },
      });

    if (createUserErr || !createdUser.user) {
      await admin
        .from("staff_invite_candidates")
        .update({
          status: INVITE_STATUS.error,
          error: createUserErr?.message ?? "Failed to create auth user",
          updated_at: new Date().toISOString(),
          created_by: access.profile.id,
        } as DB["public"]["Tables"]["staff_invite_candidates"]["Update"])
        .eq("id", candidateId);

      return NextResponse.json(
        { error: createUserErr?.message ?? "Failed to create user" },
        { status: 500 },
      );
    }

    const profileInsert: DB["public"]["Tables"]["profiles"]["Insert"] = {
      id: createdUser.user.id,
      shop_id: shopId,
      role: candidate.role ?? "mechanic",
      email,
      username,
      full_name: fullName ?? username,
      must_change_password: true,
    };

    const { error: profileInsertErr } = await admin
      .from("profiles")
      .upsert(profileInsert, { onConflict: "id" });

    if (profileInsertErr) {
      if (String(profileInsertErr.message ?? "").toLowerCase().includes("shop user limit reached")) {
        return NextResponse.json(
          { error: "Shop user limit reached for your current plan." },
          { status: 400 },
        );
      }
      await admin
        .from("staff_invite_candidates")
        .update({
          status: INVITE_STATUS.error,
          error: profileInsertErr.message,
          updated_at: new Date().toISOString(),
          created_by: access.profile.id,
        } as DB["public"]["Tables"]["staff_invite_candidates"]["Update"])
        .eq("id", candidateId);

      return NextResponse.json(
        { error: profileInsertErr.message },
        { status: 500 },
      );
    }

    const { error: workforceErr } = await admin
      .from("people_workforce_profiles")
      .upsert(
        {
          shop_id: shopId,
          user_id: createdUser.user.id,
          employment_status: "active",
          payroll_ready: false,
          notes: "Seeded from staff invite candidate; complete in People detail.",
        },
        { onConflict: "shop_id,user_id" }
      );

    if (workforceErr) {
      await admin
        .from("staff_invite_candidates")
        .update({
          status: INVITE_STATUS.error,
          error: workforceErr.message,
          updated_at: new Date().toISOString(),
          created_by: access.profile.id,
        } as DB["public"]["Tables"]["staff_invite_candidates"]["Update"])
        .eq("id", candidateId);

      return NextResponse.json(
        { error: workforceErr.message },
        { status: 500 },
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

    let finalStatus: InviteStatus = INVITE_STATUS.invited;
    let sendErrMsg: string | null = null;

    try {
      await sendUserInviteEmail({
        shopId,
        to: email,
        loginUrl: `${SITE_URL}/login`,
        username,
        tempPassword,
        role: candidate.role ?? "mechanic",
        shopName,
        inviterName,
        fullName: fullName ?? username,
        resend: false,
        createdBy: access.profile.id,
      });
    } catch (error) {
      finalStatus = INVITE_STATUS.error;
      sendErrMsg =
        error instanceof Error ? error.message : "Invite email failed";
      console.warn("[staff invite] sendgrid failed", error);
    }

    await admin
      .from("staff_invite_candidates")
      .update({
        status: finalStatus,
        error: sendErrMsg,
        updated_at: new Date().toISOString(),
        created_by: access.profile.id,
        created_user_id: createdUser.user.id,
        created_profile_id: createdUser.user.id,
        email_lc: email,
        username_lc: username,
      } as DB["public"]["Tables"]["staff_invite_candidates"]["Update"])
      .eq("id", candidateId);

    return NextResponse.json({
      ok: true,
      status: finalStatus,
      created_user_id: createdUser.user.id,
      people_record_href: `/dashboard/workforce/people/${createdUser.user.id}?from=create-user`,
      ...(sendErrMsg
        ? {
            warning: "User created but invite failed to send",
            send_error: sendErrMsg,
          }
        : {}),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
