import { NextRequest, NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { getActorCapabilities } from "@/features/shared/lib/rbac";

export async function GET(req: NextRequest) {
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;

  const actor = getActorCapabilities({ role: access.profile.role });
  const admin = access.supabase;
  const url = new URL(req.url);
  const status = url.searchParams.get("status")?.trim() || null;
  const userId = url.searchParams.get("user_id")?.trim() || null;

  let q = admin
    .from("staff_time_off_requests")
    .select("*, requester:requested_by(full_name, email), reviewer:reviewed_by(full_name, email)")
    .eq("shop_id", access.profile.shop_id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (!actor.canManageScheduling) {
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
  const targetUserId = actor.canManageScheduling ? (body.user_id ?? access.profile.id) : access.profile.id;
  if (!targetUserId) return NextResponse.json({ error: "Missing user context" }, { status: 400 });

  const admin = access.supabase;
  const insertPayload = {
    shop_id: access.profile.shop_id,
    user_id: targetUserId,
    request_type: body.request_type,
    starts_at: body.starts_at,
    ends_at: body.ends_at,
    is_partial_day: Boolean(body.is_partial_day),
    status: "pending",
    reason: body.reason ?? null,
    requested_by: access.profile.id,
  };

  const { data, error } = await admin.from("staff_time_off_requests").insert(insertPayload).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from("audit_logs").insert({
    actor_id: access.profile.id,
    action: "staff.time_off.requested",
    target: targetUserId,
    metadata: {
      shop_id: access.profile.shop_id,
      request_id: data.id,
      starts_at: body.starts_at,
      ends_at: body.ends_at,
      request_type: body.request_type,
    },
  });

  return NextResponse.json({ ok: true, request: data });
}
