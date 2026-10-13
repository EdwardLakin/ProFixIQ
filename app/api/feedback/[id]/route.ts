import { NextRequest, NextResponse } from "next/server";
import type { Json } from "@shared/types/types/supabase";
import { FEEDBACK_STATUSES, isRecord } from "@/features/feedback/lib/feedback";
import { deliverFeedbackNotifications } from "@/features/feedback/server/delivery";
import { requireOpsOperatorApiAccess } from "@/features/ops/server/operator-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const access = await requireOpsOperatorApiAccess();
  if (!access.ok) return access.response;
  const { id } = await params;
  const body: unknown = await req.json().catch(() => null);
  if (
    !isRecord(body) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      id,
    ) ||
    typeof body.expectedUpdatedAt !== "string" ||
    !Number.isFinite(Date.parse(body.expectedUpdatedAt)) ||
    (body.status !== undefined &&
      !FEEDBACK_STATUSES.some((status) => status === body.status)) ||
    (body.needsAttention !== undefined &&
      typeof body.needsAttention !== "boolean") ||
    (body.internalNotes !== undefined &&
      body.internalNotes !== null &&
      (typeof body.internalNotes !== "string" ||
        body.internalNotes.length > 12_000)) ||
    (body.notifyRequesters !== undefined &&
      typeof body.notifyRequesters !== "boolean") ||
    (body.retryUnknownNotifications !== undefined &&
      typeof body.retryUnknownNotifications !== "boolean")
  ) {
    return NextResponse.json(
      { error: "Invalid feedback update" },
      { status: 400 },
    );
  }
  const patch: Record<string, Json> = {};
  if (typeof body.status === "string") patch.status = body.status;
  if (typeof body.needsAttention === "boolean")
    patch.needsAttention = body.needsAttention;
  if (body.internalNotes !== undefined)
    patch.internalNotes =
      typeof body.internalNotes === "string"
        ? body.internalNotes.trim() || null
        : null;
  try {
    const admin = createAdminSupabase();
    const { data, error } = await admin.rpc("update_feedback", {
      p_id: id,
      p_expected_updated_at: body.expectedUpdatedAt,
      p_patch: patch,
    });
    if (error) {
      const status =
        error.code === "40001" ? 409 : error.code === "P0002" ? 404 : 503;
      return NextResponse.json(
        {
          error:
            status === 409
              ? "Feedback changed concurrently; reload and retry"
              : "Could not update feedback",
        },
        { status },
      );
    }
    const delivery = await deliverFeedbackNotifications(admin, id, {
      owner: true,
      requesters: body.notifyRequesters === true,
      retryUnknown: body.retryUnknownNotifications === true,
    });
    const metadata: unknown = data;
    return NextResponse.json({
      ok: true,
      status: isRecord(metadata) ? metadata.status : null,
      ...delivery,
    });
  } catch (error) {
    console.error("feedback update failed", error);
    return NextResponse.json(
      { error: "Feedback is temporarily unavailable" },
      { status: 503 },
    );
  }
}
