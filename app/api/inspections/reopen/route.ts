import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";

const REOPEN_ALLOWED_ROLES = new Set(["admin", "advisor", "owner", "manager"]);

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseRoute();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as {
    inspectionId?: unknown;
    reason?: unknown;
  } | null;

  const inspectionId = asString(body?.inspectionId);
  const reason = asString(body?.reason);

  if (!inspectionId) return NextResponse.json({ error: "inspectionId is required" }, { status: 400 });
  if (!reason) return NextResponse.json({ error: "Reopen reason is required" }, { status: 400 });

  const { data: me, error: meErr } = await supabase
    .from("profiles")
    .select("id, shop_id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (meErr || !me?.shop_id) {
    return NextResponse.json({ error: meErr?.message ?? "Missing profile/shop scope" }, { status: 400 });
  }

  if (!REOPEN_ALLOWED_ROLES.has(String(me.role ?? "").toLowerCase())) {
    return NextResponse.json({ error: "Forbidden: only admin/advisor/owner/manager can reopen inspections." }, { status: 403 });
  }

  const { data: inspection, error: inspectionErr } = await supabase
    .from("inspections")
    .select("id, shop_id, locked")
    .eq("id", inspectionId)
    .maybeSingle();

  if (inspectionErr) return NextResponse.json({ error: inspectionErr.message }, { status: 500 });
  if (!inspection) return NextResponse.json({ error: "Inspection not found" }, { status: 404 });
  if (inspection.shop_id !== me.shop_id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!inspection.locked) {
    return NextResponse.json({ ok: true, alreadyOpen: true });
  }

  const nowIso = new Date().toISOString();
  const reopenPatch: Record<string, unknown> = {
    locked: false,
    status: "in_progress",
    is_draft: true,
    completed: false,
    reopened_at: nowIso,
    reopened_by: user.id,
    reopen_reason: reason,
    updated_at: nowIso,
  };

  const { error: updateErr } = await supabase
    .from("inspections")
    .update(reopenPatch)
    .eq("id", inspectionId);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, reopenedAt: nowIso });
}
