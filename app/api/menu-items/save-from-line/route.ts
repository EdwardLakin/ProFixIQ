// app/api/menu-items/save-from-line/route.ts
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type WorkOrderLineRow = DB["public"]["Tables"]["work_order_lines"]["Row"];
type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type ProfileRow = DB["public"]["Tables"]["profiles"]["Row"];
type MenuInsert = DB["public"]["Tables"]["menu_items"]["Insert"];

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  // 1) Auth
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    console.error("[menu-items/save-from-line] auth error:", userErr);
    return NextResponse.json(
      { ok: false, error: "auth_error", detail: userErr?.message ?? "Not signed in" },
      { status: 401 },
    );
  }

  // 2) Parse body
  const body = (await req.json().catch(() => null)) as {
    workOrderLineId?: string;
  } | null;

  const lineId = body?.workOrderLineId;
  if (!lineId) {
    return NextResponse.json(
      { ok: false, error: "bad_request", detail: "workOrderLineId is required" },
      { status: 400 },
    );
  }

  // 3) Load the work order line
  const { data: wol, error: wolErr } = await supabase
    .from("work_order_lines")
    .select("*")
    .eq("id", lineId)
    .maybeSingle<WorkOrderLineRow>();

  if (wolErr) {
    console.error("[menu-items/save-from-line] load line error:", wolErr.message);
    return NextResponse.json(
      { ok: false, error: "line_load_failed", detail: wolErr.message },
      { status: 500 },
    );
  }

  if (!wol) {
    return NextResponse.json(
      { ok: false, error: "not_found", detail: "Work order line not found" },
      { status: 404 },
    );
  }

  // If it already has a menu_item_id, nothing to do
  if (wol.menu_item_id) {
    return NextResponse.json({ ok: true, alreadyLinked: true });
  }

  if (!wol.work_order_id) {
    return NextResponse.json(
      {
        ok: false,
        error: "bad_state",
        detail: "Work order line is not linked to a work order",
      },
      { status: 400 },
    );
  }

  // 4) Load the work order to get shop_id
  const { data: wo, error: woErr } = await supabase
    .from("work_orders")
    .select("*")
    .eq("id", wol.work_order_id)
    .maybeSingle<WorkOrderRow>();

  if (woErr) {
    console.error("[menu-items/save-from-line] load work order error:", woErr.message);
    return NextResponse.json(
      { ok: false, error: "order_load_failed", detail: woErr.message },
      { status: 500 },
    );
  }

  // 5) Resolve shop_id (order first, then profile)
  let shopId: string | null = (wo?.shop_id as string | null) ?? null;

  if (!shopId) {
    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("shop_id")
      .eq("id", user.id)
      .maybeSingle<ProfileRow>();

    if (profErr) {
      console.warn(
        "[menu-items/save-from-line] profile lookup failed:",
        profErr.message,
      );
    }
    shopId = (prof?.shop_id as string | null) ?? null;
  }

  if (!shopId) {
    return NextResponse.json(
      {
        ok: false,
        error: "missing_shop",
        detail: "Cannot save menu item — missing shop for work order line",
      },
      { status: 400 },
    );
  }

  // 6) Build menu_items insert from the line
  const name =
    wol.description && wol.description.trim().length > 0
      ? wol.description.trim()
      : "Service item";

  const itemInsert: MenuInsert = {
    name,
    description: wol.description ?? null,
    labor_time: null, // keep legacy field null if you’re using labor_hours
    labor_hours: (wol as any).labor_hours ?? null, // if you have labor_hours column on lines
    part_cost: null, // can be filled later from parts if you want
    total_price: null,
    inspection_template_id: null,
    user_id: user.id,
    is_active: true,
    shop_id: shopId,
    // new “link back to line” field we added in the migration:
    work_order_line_id: wol.id as any,
  };

  console.log("[menu-items/save-from-line] inserting menu item:", itemInsert);

  // 7) Insert menu item
  const { data: created, error: itemErr } = await supabase
    .from("menu_items")
    .insert(itemInsert)
    .select("id")
    .single();

  if (itemErr || !created) {
    console.error(
      "[menu-items/save-from-line] menu_items insert failed:",
      itemErr?.message,
    );
    return NextResponse.json(
      {
        ok: false,
        error: "insert_failed",
        detail: itemErr?.message ?? "Insert into menu_items failed",
      },
      { status: 400 },
    );
  }

  // 8) Attach new menu_item_id back to the line
  const { error: linkErr } = await supabase
    .from("work_order_lines")
    .update({ menu_item_id: created.id })
    .eq("id", wol.id);

  if (linkErr) {
    console.error(
      "[menu-items/save-from-line] failed to link line to menu item:",
      linkErr.message,
    );
    // we still created the menu item, but the link failed
    return NextResponse.json(
      {
        ok: false,
        error: "link_failed",
        detail: linkErr.message,
        menuItemId: created.id,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, menuItemId: created.id });
}