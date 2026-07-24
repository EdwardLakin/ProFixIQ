import { NextRequest, NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

const REQUEST_TYPES = new Set(["vacation", "personal", "appointment", "sick", "other"]);

export async function GET(req: NextRequest) {
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;

  const actor = getActorCapabilities({ role: access.profile.role });
  const admin = createAdminSupabase();
  const url = new URL(req.url);
  const status = url.searchParams.get("status")?.trim() || null;
  const userId = url.searchParams.get("user_id")?.trim() || null;

  let q = admin
    .from("staff_time_off_requests")
    .select("*, employee:user_id(full_name, email), requester:requested_by(full_name, email), reviewer:reviewed_by(full_name, email)")
    .eq("shop_id", access.profile.shop_id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (!actor.canApproveTimeAway) {
    q = q.eq("user_id", access.profile.id);
  } else if (userId) {
    q = q.eq("user_id", userId);
  }

  if (status) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ requests: data ?? [] });
}

export async function POST(req: NextRequest) {
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;

  const body = await req.json().catch(() => null) as null | {
    user_id?: string;
    request_type?: string;
    starts_at?: string;
    ends_at?: string;
    is_partial_day?: boolean;
    reason?: string | null;
  };

  if (!body?.starts_at || !body?.ends_at || !body?.request_type) {
    return NextResponse.json({ error: "request_type, starts_at, ends_at required" }, { status: 400 });
  }

  const actor = getActorCapabilities({ role: access.profile.role });
  const requestType = body.request_type.trim().toLowerCase();
  if (!REQUEST_TYPES.has(requestType)) {
    return NextResponse.json({ error: "Choose vacation, personal, appointment, sick, or other." }, { status: 400 });
  }
  const startsAt = new Date(body.starts_at);
  const endsAt = new Date(body.ends_at);
  if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || endsAt <= startsAt) {
    return NextResponse.json({ error: "Request end must be after request start." }, { status: 400 });
  }

  const targetUserId = actor.canApproveTimeAway ? (body.user_id ?? access.profile.id) : access.profile.id;
  if (!targetUserId) return NextResponse.json({ error: "Missing user context" }, { status: 400 });

  const admin = createAdminSupabase() as any;
  const { data: target } = await admin
    .from("profiles")
    .select("id")
    .eq("id", targetUserId)
    .eq("shop_id", access.profile.shop_id)
    .maybeSingle();
  if (!target) return NextResponse.json({ error: "Employee not found in this shop." }, { status: 404 });

  const { data, error } = await admin.rpc("submit_staff_time_off_request", {
    p_shop_id: access.profile.shop_id,
    p_actor_profile_id: access.profile.id,
    p_target_user_id: targetUserId,
    p_request_type: requestType,
    p_starts_at: startsAt.toISOString(),
    p_ends_at: endsAt.toISOString(),
    p_is_partial_day: Boolean(body.is_partial_day),
    p_reason: body.reason ?? null,
  });
  if (error) {
    const conflict = /overlapping active request/i.test(error.message);
    return NextResponse.json({ error: error.message }, { status: conflict ? 409 : 400 });
  }

  return NextResponse.json({ ok: true, request: data });
}
