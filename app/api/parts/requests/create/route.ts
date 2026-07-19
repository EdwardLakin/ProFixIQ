// app/api/parts/requests/create/route.ts

import { NextResponse } from "next/server";
import type { Database } from "@shared/types/types/supabase";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type DB = Database;

type BodyItem = {
  description: string;
  qty: number;
  partNumber?: string | null;
  manufacturer?: string | null;
};

type Body = {
  workOrderId: string;
  jobId?: string | null;
  items: BodyItem[];
  notes?: string | null;
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function POST(req: Request) {
  // 1) parse + validate
  const body = (await req.json().catch(() => null)) as Body | null;
  if (
    !body ||
    typeof body.workOrderId !== "string" ||
    !Array.isArray(body.items) ||
    body.items.length === 0
  ) {
    return NextResponse.json(
      { error: "Invalid body. Expect { workOrderId, items[] }." },
      { status: 400 },
    );
  }

  const workOrderId = body.workOrderId.trim();
  if (!workOrderId || !isUuid(workOrderId)) {
    return NextResponse.json(
      { error: "A valid workOrderId is required." },
      { status: 400 },
    );
  }

  // IMPORTANT: RPC args usually want undefined, not null.
  const jobId =
    typeof body.jobId === "string" && body.jobId.trim().length > 0
      ? body.jobId.trim()
      : undefined;
  if (jobId && !isUuid(jobId)) {
    return NextResponse.json(
      { error: "jobId must be a valid work-order line id." },
      { status: 400 },
    );
  }

  const notes =
    typeof body.notes === "string" && body.notes.trim().length > 0
      ? body.notes.trim()
      : undefined;

  // Normalize items: trim, qty>=1, drop empty descriptions
  const items = body.items
    .map((it) => ({
      description: String(it.description ?? "").trim(),
      qty: Math.max(1, Number(it.qty) || 1),
      partNumber:
        typeof it.partNumber === "string" && it.partNumber.trim().length > 0
          ? it.partNumber.trim()
          : null,
      manufacturer:
        typeof it.manufacturer === "string" && it.manufacturer.trim().length > 0
          ? it.manufacturer.trim()
          : null,
    }))
    .filter((it) => it.description.length > 0);

  if (items.length === 0) {
    return NextResponse.json({ error: "No valid items." }, { status: 400 });
  }

  // 2) auth + tenant boundary. Technicians, Parts, and shop operators may
  // create requests only against work orders in their current shop.
  const access = await requireShopScopedApiAccess({
    allowRoles: [
      "owner",
      "admin",
      "manager",
      "advisor",
      "service",
      "parts",
      "mechanic",
      "lead_hand",
      "foreman",
    ],
  });
  if (!access.ok) return access.response;

  const supabase = access.supabase;
  const shopId = access.profile.shop_id;

  const { data: workOrder, error: workOrderError } = await supabase
    .from("work_orders")
    .select("id")
    .eq("id", workOrderId)
    .eq("shop_id", shopId)
    .maybeSingle();
  if (workOrderError) {
    return NextResponse.json(
      { error: workOrderError.message },
      { status: 500 },
    );
  }
  if (!workOrder) {
    return NextResponse.json(
      { error: "Work order not found for the current shop." },
      { status: 404 },
    );
  }

  if (jobId) {
    const { data: line, error: lineError } = await supabase
      .from("work_order_lines")
      .select("id")
      .eq("id", jobId)
      .eq("work_order_id", workOrderId)
      .eq("shop_id", shopId)
      .maybeSingle();
    if (lineError) {
      return NextResponse.json({ error: lineError.message }, { status: 500 });
    }
    if (!line) {
      return NextResponse.json(
        { error: "Work-order line not found for this work order and shop." },
        { status: 404 },
      );
    }
  }

  // 3) atomic RPC
  type RpcArgs =
    DB["public"]["Functions"]["create_part_request_with_items"]["Args"];

  const args: RpcArgs = {
    p_work_order_id: workOrderId,
    // json/jsonb in Postgres; generated types may be loose
    p_items: items as unknown as RpcArgs["p_items"],
    ...(jobId ? { p_job_id: jobId } : {}),
    ...(notes ? { p_notes: notes } : {}),
  };

  const { data, error } = await supabase.rpc(
    "create_part_request_with_items",
    args,
  );

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to create part request" },
      { status: 500 },
    );
  }

  const { data: created } = await supabase
    .from("part_requests")
    .select("status")
    .eq("id", data)
    .eq("shop_id", shopId)
    .maybeSingle();

  return NextResponse.json({
    requestId: data,
    status: created?.status ?? null,
  });
}
