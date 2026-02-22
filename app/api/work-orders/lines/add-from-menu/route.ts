// app/api/work-orders/lines/add-from-menu/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type Body = {
  workOrderId: string;
  menuItemId: string;
  notes?: string | null;

  laborHours?: number | null;

  // kept for caller compatibility (not used here yet)
  status: "fail" | "recommend";
  source: "inspection";
};

type MenuItemRow = {
  id: string;
  name: string | null;
  description: string | null;
  complaint: string | null;
  cause: string | null;
  correction: string | null;
  tools: string | null;
  shop_id: string | null;
  labor_hours: number | null;
  base_labor_hours: number | null;
  total_price: number | null;
  base_price: number | null;
  inspection_template_id: string | null;
  service_key: string | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseMenu(row: unknown): MenuItemRow | null {
  if (!isRecord(row)) return null;

  const id = asString(row.id);
  if (!id) return null;

  return {
    id,
    name: asString(row.name),
    description: asString(row.description),
    complaint: asString(row.complaint),
    cause: asString(row.cause),
    correction: asString(row.correction),
    tools: asString(row.tools),
    shop_id: asString(row.shop_id),
    labor_hours: asNumber(row.labor_hours),
    base_labor_hours: asNumber(row.base_labor_hours),
    total_price: asNumber(row.total_price),
    base_price: asNumber(row.base_price),
    inspection_template_id: asString(row.inspection_template_id),
    service_key: asString(row.service_key),
  };
}

export async function POST(req: Request): Promise<NextResponse> {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const workOrderId = String(body.workOrderId ?? "").trim();
  const menuItemId = String(body.menuItemId ?? "").trim();
  const notes = body.notes ?? null;

  if (!workOrderId || !menuItemId) {
    return NextResponse.json(
      { ok: false, error: "Missing workOrderId or menuItemId" },
      { status: 400 },
    );
  }

  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { data: rawMenu, error: menuErr } = await supabase
    .from("menu_items")
    .select(
      [
        "id",
        "name",
        "description",
        "complaint",
        "cause",
        "correction",
        "tools",
        "shop_id",
        "labor_hours",
        "base_labor_hours",
        "total_price",
        "base_price",
        "inspection_template_id",
        "service_key",
      ].join(","),
    )
    .eq("id", menuItemId)
    .maybeSingle();

  if (menuErr) {
    return NextResponse.json({ ok: false, error: menuErr.message }, { status: 500 });
  }

  const menu = parseMenu(rawMenu);
  if (!menu) {
    return NextResponse.json({ ok: false, error: "Menu item not found" }, { status: 404 });
  }

  const laborOverride =
    typeof body.laborHours === "number" && Number.isFinite(body.laborHours)
      ? body.laborHours
      : null;

  const laborHours = laborOverride ?? menu.labor_hours ?? menu.base_labor_hours ?? 0.5;
  const priceEstimate = menu.total_price ?? menu.base_price ?? null;

  // We intentionally do NOT create part allocations here:
  // work_order_part_allocations requires location_id and represents inventory movement.
  // This flow is "reuse existing menu repair" and skip quoting/parts request.

  const insertRow: Record<string, unknown> = {
    work_order_id: workOrderId,
    menu_item_id: menu.id,

    description: String(menu.name ?? menu.description ?? "Menu repair"),
    complaint: menu.complaint,
    cause: menu.cause,
    correction: menu.correction,
    tools: menu.tools,
    notes,

    labor_hours: laborHours,
    price_estimate: priceEstimate,

    job_type: "repair",
    shop_id: menu.shop_id,
    inspection_template_id: menu.inspection_template_id,
    service_code: menu.service_key,

    // ✅ Tech-approval gate (your allowed values)
    approval_state: "pending",
    status: "awaiting_approval",
  };

  const { data: created, error: createErr } = await supabase
    .from("work_order_lines")
    .insert(insertRow)
    .select("id")
    .single();

  if (createErr) {
    return NextResponse.json({ ok: false, error: createErr.message }, { status: 500 });
  }

  const createdId =
    isRecord(created) && typeof created.id === "string" ? created.id : null;

  return NextResponse.json({ ok: true, workOrderLineId: createdId });
}