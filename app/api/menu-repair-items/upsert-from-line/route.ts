import "server-only";

import { NextResponse } from "next/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { upsertMenuRepairItemFromCompletedLine } from "@/features/menu-repair-items/server/upsertMenuRepairItemFromCompletedLine";

export const runtime = "nodejs";

type RequestBody = {
  workOrderLineId?: string;
};

const ALLOWED_ROLES = [
  "owner",
  "admin",
  "manager",
  "advisor",
  "service",
  "parts",
  "mechanic",
  "lead_hand",
  "foreman",
] as const;

export async function POST(req: Request) {
  const access = await requireShopScopedApiAccess({
    allowRoles: [...ALLOWED_ROLES],
  });
  if (!access.ok) return access.response;

  const body = (await req.json().catch(() => null)) as RequestBody | null;
  const workOrderLineId = body?.workOrderLineId?.trim() ?? "";
  if (!workOrderLineId) {
    return NextResponse.json(
      {
        ok: false,
        error: "bad_request",
        detail: "workOrderLineId is required",
      },
      { status: 400 },
    );
  }

  try {
    const result = await upsertMenuRepairItemFromCompletedLine({
      supabase: access.supabase,
      shopId: access.profile.shop_id,
      workOrderLineId,
      actorUserId: access.authUserId,
    });
    return NextResponse.json(result);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Repair memory update failed";
    const status = detail.includes("completed work") ? 409 : detail.includes("not found") ? 404 : 500;
    return NextResponse.json(
      { ok: false, error: "repair_memory_update_failed", detail },
      { status },
    );
  }
}
