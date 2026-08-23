export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import { WORKSPACE_CAPABILITIES } from "@/features/workspace/authorization/capabilities";

type Body = {
  work_order_id?: string;
  tech_id?: string;
  only_unassigned?: boolean;
  operationKey?: string;
  idempotencyKey?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Body | null;
    const workOrderId = body?.work_order_id?.trim() ?? "";
    const technicianId = body?.tech_id?.trim() ?? "";
    const operationKey =
      req.headers.get("Idempotency-Key")?.trim() ||
      body?.operationKey?.trim() ||
      body?.idempotencyKey?.trim() ||
      "";

    if (!workOrderId) {
      return NextResponse.json(
        { error: "work_order_id is required" },
        { status: 400 },
      );
    }
    if (!technicianId) {
      return NextResponse.json(
        { error: "tech_id is required" },
        { status: 400 },
      );
    }
    if (!operationKey) {
      return NextResponse.json(
        { error: "A stable Idempotency-Key is required." },
        { status: 400 },
      );
    }

    const access = await requireShopScopedApiAccess({
      requiredWorkspaceCapability:
        WORKSPACE_CAPABILITIES.manageWorkOrderAssignments,
    });
    if (!access.ok) return access.response;

    const admin = await createAdminSupabase();
    const { data, error } = await admin.rpc(
      "assign_work_order_primary_technician_bulk_atomic",
      {
        p_shop_id: access.profile.shop_id,
        p_work_order_id: workOrderId,
        p_technician_id: technicianId,
        p_actor_user_id: access.profile.id,
        p_only_unassigned: body?.only_unassigned ?? true,
        p_operation_key: `${access.profile.shop_id}:bulk-primary-assignment:${operationKey}`,
      },
    );

    if (error) {
      const message = [error.message, error.details, error.hint]
        .filter(Boolean)
        .join(" — ");
      const status = message.includes("not found for shop")
        ? 404
        : message.includes("FINANCIALLY_LOCKED")
          ? 409
          : 400;
      return NextResponse.json({ error: message }, { status });
    }

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
