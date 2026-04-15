import { NextRequest, NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { getActorCapabilities } from "@/features/shared/lib/rbac";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, context: Ctx) {
  const { id } = await context.params;
  const access = await requireShopScopedApiAccess();
  if (!access.ok) return access.response;

  const body = await req.json().catch(() => null) as null | {
    status?: "pending" | "approved" | "declined" | "cancelled";
    review_note?: string | null;
  };

  if (!body?.status) return NextResponse.json({ error: "status required" }, { status: 400 });

  const admin = access.supabase as any;
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
  if (!actor.canManageScheduling && !(isOwn && body.status === "cancelled" && existing.status === "pending")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const next: Record<string, unknown> = {
    status: body.status,
    updated_at: new Date().toISOString(),
  };

  if (body.status === "approved" || body.status === "declined") {
    next.reviewed_at = new Date().toISOString();
    next.reviewed_by = access.profile.id;
    next.review_note = body.review_note ?? null;
  }

  const { data: updated, error: updateErr } = await admin
    .from("staff_time_off_requests")
    .update(next)
    .eq("id", id)
    .eq("shop_id", access.profile.shop_id)
    .select("*")
    .single();

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  if (body.status === "approved") {
    await admin.from("staff_availability_blocks").upsert({
      shop_id: access.profile.shop_id,
      user_id: existing.user_id,
      source_type: "time_off_request",
      source_id: existing.id,
      block_type: existing.request_type,
      starts_at: existing.starts_at,
      ends_at: existing.ends_at,
      label: existing.reason ?? `${existing.request_type} time away`,
      updated_at: new Date().toISOString(),
    }, { onConflict: "shop_id,source_type,source_id" });
  }

  if (body.status === "declined" || body.status === "cancelled") {
    await admin
      .from("staff_availability_blocks")
      .delete()
      .eq("shop_id", access.profile.shop_id)
      .eq("source_type", "time_off_request")
      .eq("source_id", existing.id);
  }

  await admin.from("audit_logs").insert({
    actor_id: access.profile.id,
    action: `staff.time_off.${body.status}`,
    target: existing.user_id,
    metadata: {
      shop_id: access.profile.shop_id,
      request_id: existing.id,
      previous_status: existing.status,
      next_status: body.status,
      review_note: body.review_note ?? null,
    },
  });

  return NextResponse.json({ ok: true, request: updated });
}
