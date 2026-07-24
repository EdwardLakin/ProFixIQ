import { NextRequest, NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { getActorCapabilities } from "@/features/shared/lib/rbac";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, context: Ctx) {
  const { id } = await context.params;
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;

  const body = await req.json().catch(() => null) as null | {
    status?: "pending" | "approved" | "declined" | "cancelled";
    review_note?: string | null;
  };

  if (!body?.status || !["approved", "declined", "cancelled"].includes(body.status)) {
    return NextResponse.json({ error: "Choose approve, decline, or cancel." }, { status: 400 });
  }

  const admin = createAdminSupabase() as any;
  const actor = getActorCapabilities({ role: access.profile.role });

  const { data: existing, error: existingErr } = await admin
    .from("staff_time_off_requests")
    .select("*")
    .eq("id", id)
    .eq("shop_id", access.profile.shop_id)
    .maybeSingle();

  if (existingErr) return NextResponse.json({ error: existingErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Request not found" }, { status: 404 });

  const isOwn = existing.user_id === access.profile.id;
  if (!actor.canApproveTimeAway && !(isOwn && body.status === "cancelled" && existing.status === "pending")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: updated, error: updateErr } = await admin.rpc("transition_staff_time_off_request", {
    p_shop_id: access.profile.shop_id,
    p_actor_profile_id: access.profile.id,
    p_request_id: id,
    p_next_status: body.status,
    p_review_note: body.review_note ?? null,
  });
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 409 });

  return NextResponse.json({ ok: true, request: updated });
}
