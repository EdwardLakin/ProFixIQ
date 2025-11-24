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

// extend with optional numeric fields your line might have
type WorkOrderLineMaybeTotals = WorkOrderLineRow & {
  labor_hours?: number | null;
  labor_time?: number | null;
  labor_total?: number | null;
  parts_total?: number | null;
  part_total?: number | null;
  line_total?: number | null;
  total?: number | null;
};

interface SaveFromLineResponse {
  ok: boolean;
  menuItemId?: string;
  alreadyLinked?: boolean;
  linkFailed?: boolean;
  linkError?: string;
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

  /* ---------------------------------------------------------------------- */
  /* 1) AUTH                                                                */
  /* ---------------------------------------------------------------------- */
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    const body: SaveFromLineResponse = {
      ok: false,
      error: "auth_error",
      detail: userErr?.message ?? "Not signed in",
    };
    return NextResponse.json(body, { status: 401 });
  }

  /* ---------------------------------------------------------------------- */
  /* 2) Parse Body                                                          */
  /* ---------------------------------------------------------------------- */
  const json = (await req.json().catch(() => null)) as RequestBody | null;
  const lineId = json?.workOrderLineId;

  if (!lineId) {
    const body: SaveFromLineResponse = {
      ok: false,
      error: "bad_request",
      detail: "workOrderLineId is required",
    };
    return NextResponse.json(body, { status: 400 });
  }

  /* ---------------------------------------------------------------------- */
  /* 3) Load work_order_line                                                */
  /* ---------------------------------------------------------------------- */
  const { data: wolRaw, error: wolErr } = await supabase
    .from("work_order_lines")
    .select("*")
    .eq("id", lineId)
    .maybeSingle<WorkOrderLineRow>();

  if (wolErr) {
    const body: SaveFromLineResponse = {
      ok: false,
      error: "line_load_failed",
      detail: wolErr.message,
    };
    return NextResponse.json(body, { status: 500 });
  }

  if (!wolRaw) {
    const body: SaveFromLineResponse = {
      ok: false,
      error: "not_found",
      detail: "Work order line not found",
    };
    return NextResponse.json(body, { status: 404 });
  }

  const wol = wolRaw as WorkOrderLineMaybeTotals;

  if (wol.menu_item_id) {
    const body: SaveFromLineResponse = {
      ok: true,
      alreadyLinked: true,
      menuItemId: wol.menu_item_id,
    };
    return NextResponse.json(body, { status: 200 });
  }

  if (!wol.work_order_id) {
    const body: SaveFromLineResponse = {
      ok: false,
      error: "bad_state",
      detail: "Work order line is not linked to a work order",
    };
    return NextResponse.json(body, { status: 400 });
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
    const body: SaveFromLineResponse = {
      ok: false,
      error: "order_load_failed",
      detail: woErr.message,
    };
    return NextResponse.json(body, { status: 500 });
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
    const body: SaveFromLineResponse = {
      ok: false,
      error: "missing_shop",
      detail: "Cannot save menu item — missing shop for work order line",
    };
    return NextResponse.json(body, { status: 400 });
  }

  /* ---------------------------------------------------------------------- */
  /* 5) Normalize line → MenuInsert numeric fields                          */
  /* ---------------------------------------------------------------------- */
  const laborHours = pickFirstNumber(wol.labor_hours, wol.labor_time);

  const partCost = pickFirstNumber(
    wol.parts_total,
    wol.part_total,
  );

  const totalPrice = pickFirstNumber(
    wol.line_total,
    wol.total,
  );

  const name =
    wol.description && wol.description.trim().length > 0
      ? wol.description.trim()
      : "Service item";

  const itemInsert: MenuInsert = {
    name,
    description: wol.description ?? null,
    labor_time: laborHours,
    labor_hours: laborHours,
    part_cost: partCost,
    total_price: totalPrice,
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
    const body: SaveFromLineResponse = {
      ok: false,
      error: "insert_failed",
      detail: itemErr?.message ?? "Insert failed",
    };
    return NextResponse.json(body, { status: 400 });
  }

  /* ---------------------------------------------------------------------- */
  /* 7) Attach menu_item_id back to work_order_lines                        */
  /* ---------------------------------------------------------------------- */
  const { error: linkErr } = await supabase
    .from("work_order_lines")
    .update({ menu_item_id: created.id })
    .eq("id", wol.id);

  if (linkErr) {
    const body: SaveFromLineResponse = {
      ok: true,
      menuItemId: created.id,
      linkFailed: true,
      linkError: linkErr.message,
    };
    return NextResponse.json(body, { status: 200 });
  }

  const body: SaveFromLineResponse = {
    ok: true,
    menuItemId: created.id,
    linkFailed: false,
  };
  return NextResponse.json(body, { status: 200 });
}