// app/api/menu-items/upsert-from-line/route.ts
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export const runtime = "nodejs";

type DB = Database;
type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type MenuItemInsert = DB["public"]["Tables"]["menu_items"]["Insert"];
type MenuItemUpdate = DB["public"]["Tables"]["menu_items"]["Update"];

type WorkOrderLineMaybeTotals = WorkOrderLine & {
  labor_hours?: number | null;
  labor_time?: number | null;
  labor_total?: number | null;
  parts_total?: number | null;
  part_total?: number | null;
  line_total?: number | null;
  total?: number | null;
};

interface UpsertFromLineResponse {
  ok: boolean;
  menuItemId?: string;
  updated?: boolean;
  error?: string;
  detail?: string;
}

function pickFirstNumber(
  ...values: Array<number | null | undefined>
): number | null {
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  const body = (await req.json().catch(() => null)) as
    | { workOrderLineId?: string }
    | null;

  const lineId = body?.workOrderLineId;
  if (!lineId) {
    const resp: UpsertFromLineResponse = {
      ok: false,
      error: "bad_request",
      detail: "Missing workOrderLineId",
    };
    return NextResponse.json(resp, { status: 400 });
  }

  // 1) Fetch the full work order line so we can read totals if present
  const { data: wolRaw, error: wolErr } = await supabase
    .from("work_order_lines")
    .select("*")
    .eq("id", lineId)
    .maybeSingle<WorkOrderLine>();

  if (wolErr) {
    const resp: UpsertFromLineResponse = {
      ok: false,
      error: "line_load_failed",
      detail: wolErr.message,
    };
    return NextResponse.json(resp, { status: 500 });
  }

  if (!wolRaw) {
    const resp: UpsertFromLineResponse = {
      ok: false,
      error: "not_found",
      detail: "Work order line not found",
    };
    return NextResponse.json(resp, { status: 404 });
  }

  const wol = wolRaw as WorkOrderLineMaybeTotals;

  if (!wol.work_order_id) {
    const resp: UpsertFromLineResponse = {
      ok: false,
      error: "bad_state",
      detail: "Cannot save menu item — missing work order",
    };
    return NextResponse.json(resp, { status: 400 });
  }

  // 2) Fetch the parent work order to get shop_id
  const { data: wo, error: woErr } = await supabase
    .from("work_orders")
    .select("id, shop_id")
    .eq("id", wol.work_order_id)
    .maybeSingle<Pick<WorkOrder, "id" | "shop_id">>();

  if (woErr) {
    const resp: UpsertFromLineResponse = {
      ok: false,
      error: "order_load_failed",
      detail: woErr.message,
    };
    return NextResponse.json(resp, { status: 500 });
  }

  const shopId = wo?.shop_id ?? null;
  if (!shopId) {
    const resp: UpsertFromLineResponse = {
      ok: false,
      error: "missing_shop",
      detail: "Cannot save menu item — missing shop for work order",
    };
    return NextResponse.json(resp, { status: 400 });
  }

  const name = wol.description?.trim();
  if (!name) {
    const resp: UpsertFromLineResponse = {
      ok: false,
      error: "missing_description",
      detail: "Cannot save menu item — missing description",
    };
    return NextResponse.json(resp, { status: 400 });
  }

  // 3) Normalize numeric fields from the line
  const laborHours = pickFirstNumber(wol.labor_hours, wol.labor_time);
  const partCost = pickFirstNumber(wol.parts_total, wol.part_total);
  const totalPrice = pickFirstNumber(wol.line_total, wol.total);

  // 4) Update existing menu item if already linked
  if (wol.menu_item_id) {
    const updatePayload: MenuItemUpdate = {
      name,
      description: wol.description ?? null,
      labor_time: laborHours,
      labor_hours: laborHours,
      part_cost: partCost,
      total_price: totalPrice,
      is_active: true,
      shop_id: shopId,
    };

    const { error: updErr } = await supabase
      .from("menu_items")
      .update(updatePayload)
      .eq("id", wol.menu_item_id);

    if (updErr) {
      const resp: UpsertFromLineResponse = {
        ok: false,
        error: "update_failed",
        detail: updErr.message,
      };
      return NextResponse.json(resp, { status: 500 });
    }

    const resp: UpsertFromLineResponse = {
      ok: true,
      menuItemId: wol.menu_item_id,
      updated: true,
    };
    return NextResponse.json(resp, { status: 200 });
  }

  // 5) Create a new menu item
  const insertPayload: MenuItemInsert = {
    shop_id: shopId,
    name,
    description: wol.description ?? null,
    labor_time: laborHours,
    labor_hours: laborHours,
    part_cost: partCost,
    total_price: totalPrice,
    is_active: true,
    user_id: null, // if you want to associate to the current user, we can add auth here later
    inspection_template_id: null,
    work_order_line_id: wol.id,
  };

  const { data: inserted, error: insErr } = await supabase
    .from("menu_items")
    .insert(insertPayload)
    .select("id")
    .maybeSingle();

  if (insErr || !inserted) {
    const resp: UpsertFromLineResponse = {
      ok: false,
      error: "insert_failed",
      detail: insErr?.message ?? "Failed to create menu item",
    };
    return NextResponse.json(resp, { status: 500 });
  }

  const menuItemId = inserted.id as string;

  // 6) Link the line back to the new menu item
  const { error: linkErr } = await supabase
    .from("work_order_lines")
    .update({
      menu_item_id: menuItemId,
    } satisfies DB["public"]["Tables"]["work_order_lines"]["Update"])
    .eq("id", wol.id);

  if (linkErr) {
    const resp: UpsertFromLineResponse = {
      ok: false,
      error: "link_failed",
      detail: linkErr.message,
    };
    return NextResponse.json(resp, { status: 500 });
  }

  const resp: UpsertFromLineResponse = {
    ok: true,
    menuItemId,
    updated: false,
  };
  return NextResponse.json(resp, { status: 200 });
}