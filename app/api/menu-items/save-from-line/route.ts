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

interface RequestBody {
  workOrderLineId?: string;
}

// allow reading labor_hours safely whether it exists in your schema or not
type WorkOrderLineMaybeLabor = WorkOrderLineRow & {
  labor_hours?: number | null;
};

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  /* ---------------------------------------------------------------------- */
  /* 1) AUTH                                                                */
  /* ---------------------------------------------------------------------- */
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json(
      {
        ok: false,
        error: "auth_error",
        detail: userErr?.message ?? "Not signed in",
      },
      { status: 401 },
    );
  }

  /* ---------------------------------------------------------------------- */
  /* 2) Parse Body                                                          */
  /* ---------------------------------------------------------------------- */
  const json = await req.json().catch(() => null) as RequestBody | null;
  const lineId = json?.workOrderLineId;

  if (!lineId) {
    return NextResponse.json(
      { ok: false, error: "bad_request", detail: "workOrderLineId is required" },
      { status: 400 },
    );
  }

  /* ---------------------------------------------------------------------- */
  /* 3) Load work_order_line                                                 */
  /* ---------------------------------------------------------------------- */
  const { data: wol, error: wolErr } = await supabase
    .from("work_order_lines")
    .select("*")
    .eq("id", lineId)
    .maybeSingle<WorkOrderLineRow>();

  if (wolErr) {
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

  /* ---------------------------------------------------------------------- */
  /* 4) Load work_order → determine shop_id                                 */
  /* ---------------------------------------------------------------------- */
  const { data: wo, error: woErr } = await supabase
    .from("work_orders")
    .select("*")
    .eq("id", wol.work_order_id)
    .maybeSingle<WorkOrderRow>();

  if (woErr) {
    return NextResponse.json(
      { ok: false, error: "order_load_failed", detail: woErr.message },
      { status: 500 },
    );
  }

  let shopId: string | null = wo?.shop_id ?? null;

  // fallback to profile
  if (!shopId) {
    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("shop_id")
      .eq("id", user.id)
      .maybeSingle<Pick<ProfileRow, "shop_id">>();

    if (!profErr && prof?.shop_id) {
      shopId = prof.shop_id;
    }
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

  /* ---------------------------------------------------------------------- */
  /* 5) Build MenuInsert                                                    */
  /* ---------------------------------------------------------------------- */
  const wolExtended = wol as WorkOrderLineMaybeLabor;

  const laborHoursValue: number | null =
    typeof wolExtended.labor_hours === "number" &&
    Number.isFinite(wolExtended.labor_hours)
      ? wolExtended.labor_hours
      : null;

  const itemInsert: MenuInsert = {
    name:
      wol.description && wol.description.trim().length > 0
        ? wol.description.trim()
        : "Service item",
    description: wol.description ?? null,
    labor_time: null,
    labor_hours: laborHoursValue,
    part_cost: null,
    total_price: null,
    inspection_template_id: null,
    user_id: user.id,
    is_active: true,
    shop_id: shopId,
    work_order_line_id: wol.id,
  };

  /* ---------------------------------------------------------------------- */
  /* 6) Insert into menu_items                                              */
  /* ---------------------------------------------------------------------- */
  const { data: created, error: itemErr } = await supabase
    .from("menu_items")
    .insert(itemInsert)
    .select("id")
    .single();

  if (itemErr || !created) {
    return NextResponse.json(
      {
        ok: false,
        error: "insert_failed",
        detail: itemErr?.message ?? "Insert failed",
      },
      { status: 400 },
    );
  }

  /* ---------------------------------------------------------------------- */
  /* 7) Attach menu_item_id back to work_order_lines                        */
  /* ---------------------------------------------------------------------- */
  const { error: linkErr } = await supabase
    .from("work_order_lines")
    .update({ menu_item_id: created.id })
    .eq("id", wol.id);

  if (linkErr) {
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