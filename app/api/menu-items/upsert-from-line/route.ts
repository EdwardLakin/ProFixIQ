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

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  const body = (await req.json().catch(() => null)) as
    | { workOrderLineId?: string }
    | null;

  const lineId = body?.workOrderLineId;
  if (!lineId) {
    return NextResponse.json(
      { error: "Missing workOrderLineId" },
      { status: 400 },
    );
  }

  // 1) Fetch the work order line
  const { data: wol, error: wolErr } = await supabase
    .from("work_order_lines")
    .select("id, description, work_order_id, status, menu_item_id")
    .eq("id", lineId)
    .maybeSingle<Pick<
      WorkOrderLine,
      "id" | "description" | "work_order_id" | "status" | "menu_item_id"
    >>();

  if (wolErr) {
    return NextResponse.json({ error: wolErr.message }, { status: 500 });
  }

  if (!wol) {
    return NextResponse.json(
      { error: "Work order line not found" },
      { status: 404 },
    );
  }

  if (!wol.work_order_id) {
    return NextResponse.json(
      { error: "Cannot save menu item — missing work order" },
      { status: 400 },
    );
  }

  // 2) Fetch the parent work order to get shop_id
  const { data: wo, error: woErr } = await supabase
    .from("work_orders")
    .select("id, shop_id")
    .eq("id", wol.work_order_id)
    .maybeSingle<Pick<WorkOrder, "id" | "shop_id">>();

  if (woErr) {
    return NextResponse.json({ error: woErr.message }, { status: 500 });
  }

  const shopId = wo?.shop_id ?? null;
  if (!shopId) {
    return NextResponse.json(
      { error: "Cannot save menu item — missing shop for work order" },
      { status: 400 },
    );
  }

  const name = wol.description?.trim();
  if (!name) {
    return NextResponse.json(
      { error: "Cannot save menu item — missing description" },
      { status: 400 },
    );
  }

  // TODO: if you have a definitive "sell_price" / "line_total" column on the line,
  // compute and attach it here. For now we'll just upsert the name + shop.

  // 3) Update existing menu item if already linked
  if (wol.menu_item_id) {
    const { error: updErr } = await supabase
      .from("menu_items")
      .update({
        name,
        is_active: true,
      } satisfies MenuItemUpdate)
      .eq("id", wol.menu_item_id);

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      menuItemId: wol.menu_item_id,
      updated: true,
    });
  }

  // 4) Create a new menu item
  const { data: inserted, error: insErr } = await supabase
    .from("menu_items")
    .insert({
      shop_id: shopId,
      name,
      is_active: true,
    } satisfies MenuItemInsert)
    .select("id")
    .maybeSingle();

  if (insErr || !inserted) {
    return NextResponse.json(
      { error: insErr?.message ?? "Failed to create menu item" },
      { status: 500 },
    );
  }

  const menuItemId = inserted.id as string;

  // 5) Link the line back to the new menu item
  const { error: linkErr } = await supabase
    .from("work_order_lines")
    .update({
      menu_item_id: menuItemId,
    } satisfies DB["public"]["Tables"]["work_order_lines"]["Update"])
    .eq("id", wol.id);

  if (linkErr) {
    return NextResponse.json(
      { error: linkErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    menuItemId,
    updated: false,
  });
}