import { NextResponse } from "next/server";
import type { Database } from "@shared/types/types/supabase";
import { logOperationalEvent } from "@/features/work-orders/server/logOperationalEvent";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type DB = Database;
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}

function asString(x: unknown): string | null {
  return typeof x === "string" ? x : null;
}

function toStringArray(x: unknown): string[] | null {
  if (!Array.isArray(x)) return null;
  const out: string[] = [];
  for (const v of x) {
    if (typeof v !== "string") return null;
    out.push(v);
  }
  return out;
}

export async function POST(req: Request) {
  const access = await requireShopScopedApiAccess({
    requiredCapabilities: ["canManageWorkOrders", "canAuthorizeQuotes"],
    allowRoles: ["owner", "admin", "manager", "advisor", "service"],
  });

  if (!access.ok) {
    return access.response;
  }

  const { supabase, profile } = access;

  let workOrderId: string | null = null;
  let lineIds: string[] | null = null;

  try {
    const body = (await req.json().catch(() => null)) as unknown;

    if (typeof body !== "object" || body === null) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    workOrderId = asString((body as Record<string, unknown>).workOrderId);
    lineIds = toStringArray((body as Record<string, unknown>).lineIds);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!workOrderId || !lineIds || lineIds.length === 0) {
    return NextResponse.json(
      { error: "workOrderId and lineIds[] required" },
      { status: 400 },
    );
  }

  if (!isUuid(workOrderId)) {
    return NextResponse.json(
      {
        error:
          "Invalid workOrderId (expected UUID). You may be sending custom_id instead.",
        detail: { received: workOrderId },
      },
      { status: 400 },
    );
  }

  const badLineIds = lineIds.filter((id) => !isUuid(id));
  if (badLineIds.length > 0) {
    return NextResponse.json(
      {
        error: "One or more lineIds are invalid (expected UUIDs).",
        detail: { badLineIds },
      },
      { status: 400 },
    );
  }

  const { data: workOrder, error: workOrderError } = await supabase
    .from("work_orders")
    .select("id")
    .eq("id", workOrderId)
    .eq("shop_id", profile.shop_id)
    .maybeSingle<Pick<WorkOrderRow, "id">>();

  if (workOrderError) {
    return NextResponse.json({ error: workOrderError.message }, { status: 400 });
  }

  if (!workOrder) {
    return NextResponse.json(
      { error: "Work order is not accessible in actor shop" },
      { status: 403 },
    );
  }

  const { data: scopedLines, error: scopedLinesError } = await supabase
    .from("work_order_lines")
    .select("id")
    .eq("work_order_id", workOrderId)
    .in("id", lineIds);

  if (scopedLinesError) {
    return NextResponse.json({ error: scopedLinesError.message }, { status: 400 });
  }

  if (!scopedLines || scopedLines.length !== lineIds.length) {
    return NextResponse.json(
      { error: "One or more lineIds are not accessible for this work order" },
      { status: 403 },
    );
  }

  const { error } = await supabase.rpc("send_for_approval", {
    _wo: workOrderId,
    _line_ids: lineIds,
    _set_wo_status: true,
  });

  if (error) {
    return NextResponse.json(
      {
        error: error.message,
        code: (error as unknown as { code?: string }).code,
        details: (error as unknown as { details?: string }).details,
        hint: (error as unknown as { hint?: string }).hint,
      },
      { status: 400 },
    );
  }

  await logOperationalEvent({
    supabase,
    event: "work_order_sent_for_approval",
    actorId: profile.id,
    entityType: "work_order",
    entityId: workOrderId,
    details: {
      line_ids: lineIds,
      line_count: lineIds.length,
    },
  });

  return NextResponse.json({ ok: true });
}
