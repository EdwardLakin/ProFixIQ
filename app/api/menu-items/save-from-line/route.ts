// app/api/menu-items/save-from-line/route.ts
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;


type ProfileRow = DB["public"]["Tables"]["profiles"]["Row"];
type AllocationRow =
  DB["public"]["Tables"]["work_order_part_allocations"]["Row"];
type PartRow = DB["public"]["Tables"]["parts"]["Row"];
type MenuInsert = DB["public"]["Tables"]["menu_items"]["Insert"];
type MenuItemPartInsert = DB["public"]["Tables"]["menu_item_parts"]["Insert"];

interface RequestBody {
  workOrderLineId?: string;
}

interface SaveFromLineResponse {
  ok: boolean;
  menuItemId?: string;
  error?: string;
  detail?: string;
}

type AllocationJoined = {
  qty: AllocationRow["qty"];
  unit_cost: AllocationRow["unit_cost"];
  part_id: AllocationRow["part_id"];
  parts: { name: PartRow["name"] }[] | null;
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
  const { data: wol, error: wolErr } = await supabase
    .from("work_order_lines")
    .select(
      "id, description, work_order_id, labor_time, price_estimate, template_id, notes",
    )
    .eq("id", lineId)
    .maybeSingle();

  if (wolErr) {
    const body: SaveFromLineResponse = {
      ok: false,
      error: "line_load_failed",
      detail: wolErr.message,
    };
    return NextResponse.json(body, { status: 500 });
  }

  if (!wol) {
    const body: SaveFromLineResponse = {
      ok: false,
      error: "not_found",
      detail: "Work order line not found",
    };
    return NextResponse.json(body, { status: 404 });
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
    .select("id, shop_id")
    .eq("id", wol.work_order_id)
    .maybeSingle();

  if (woErr) {
    const body: SaveFromLineResponse = {
      ok: false,
      error: "order_load_failed",
      detail: woErr.message,
    };
    return NextResponse.json(body, { status: 500 });
  }

  let shopId: string | null = wo?.shop_id ?? null;

  // Fallback: profile.shop_id
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
  /* 5) Load line parts from work_order_part_allocations + parts            */
  /* ---------------------------------------------------------------------- */
  const { data: rawAllocations, error: allocErr } = await supabase
    .from("work_order_part_allocations")
    .select("qty, unit_cost, part_id, parts(name)")
    .eq("work_order_line_id", wol.id);

  if (allocErr) {
    const body: SaveFromLineResponse = {
      ok: false,
      error: "parts_load_failed",
      detail: allocErr.message,
    };
    return NextResponse.json(body, { status: 500 });
  }

  const allocations = (rawAllocations ?? []) as AllocationJoined[];

  const partsForMenu: Omit<MenuItemPartInsert, "menu_item_id">[] = [];
  let partCost = 0;

  allocations.forEach((a) => {
    const quantity = a.qty ?? 0;
    const unitCost = a.unit_cost ?? 0;
    if (quantity <= 0) return;

    const rawName =
      a.parts && a.parts.length > 0 ? a.parts[0]?.name ?? null : null;

    const name =
      rawName && rawName.trim().length > 0 ? rawName.trim() : "Part";

    partsForMenu.push({
      // menu_item_id will be filled after we create the menu item
      name,
      quantity,
      unit_cost: unitCost,
      user_id: user.id,
    });

    partCost += quantity * unitCost;
  });

  /* ---------------------------------------------------------------------- */
  /* 6) Build MenuInsert (labor + parts + totals)                           */
  /* ---------------------------------------------------------------------- */
  const laborTime =
    typeof wol.labor_time === "number" && Number.isFinite(wol.labor_time)
      ? wol.labor_time
      : null;

  const totalPrice =
    typeof wol.price_estimate === "number" &&
    Number.isFinite(wol.price_estimate)
      ? wol.price_estimate
      : partCost || null;

  const name =
    wol.description && wol.description.trim().length > 0
      ? wol.description.trim()
      : "Service item";

  const itemInsert: MenuInsert = {
    name,
    description: wol.notes ?? wol.description ?? null,
    labor_time: laborTime,
    labor_hours: null,
    part_cost: partCost || null,
    total_price: totalPrice,
    inspection_template_id: wol.template_id ?? null,
    user_id: user.id,
    is_active: true,
    shop_id: shopId,
    work_order_line_id: wol.id,
  };

  /* ---------------------------------------------------------------------- */
  /* 7) Insert into menu_items                                              */
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
  /* 8) Insert into menu_item_parts (if any parts)                          */
  /* ---------------------------------------------------------------------- */
  if (partsForMenu.length > 0) {
    const partsInsert: MenuItemPartInsert[] = partsForMenu.map(
      (p): MenuItemPartInsert => ({
        ...p,
        menu_item_id: created.id,
      }),
    );

    const { error: partsInsertErr } = await supabase
      .from("menu_item_parts")
      .insert(partsInsert);

    if (partsInsertErr) {
      console.warn(
        "[menu-items/save-from-line] menu_item_parts insert failed:",
        partsInsertErr.message,
      );
    }
  }

  const body: SaveFromLineResponse = {
    ok: true,
    menuItemId: created.id,
  };
  return NextResponse.json(body, { status: 200 });
}