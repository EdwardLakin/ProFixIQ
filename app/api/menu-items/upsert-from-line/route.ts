// app/api/menu-items/upsert-from-line/route.ts
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export const runtime = "nodejs";

type DB = Database;

type ProfileRow = DB["public"]["Tables"]["profiles"]["Row"];
type AllocationRow = DB["public"]["Tables"]["work_order_part_allocations"]["Row"];
type PartRow = DB["public"]["Tables"]["parts"]["Row"];

type MenuItemInsert = DB["public"]["Tables"]["menu_items"]["Insert"];
type MenuItemUpdate = DB["public"]["Tables"]["menu_items"]["Update"];
type MenuItemPartInsert = DB["public"]["Tables"]["menu_item_parts"]["Insert"];

interface RequestBody {
  workOrderLineId?: string;
}

interface UpsertResponse {
  ok: boolean;
  menuItemId?: string;
  updated?: boolean;
  error?: string;
  detail?: string;
}

type AllocationJoined = {
  qty: AllocationRow["qty"];
  unit_cost: AllocationRow["unit_cost"];
  part_id: AllocationRow["part_id"];
  // Supabase join can return object or array depending on relationship config.
  parts: { name: PartRow["name"] }[] | { name: PartRow["name"] } | null;
};

function isUuid(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const s = v.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s,
  );
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : Number.isFinite(Number(v)) ? Number(v) : 0;
}

function partNameFromJoin(j: AllocationJoined["parts"]): string | null {
  if (!j) return null;

  // array form
  if (Array.isArray(j)) {
    const nm = j[0]?.name;
    return typeof nm === "string" && nm.trim().length ? nm.trim() : null;
  }

  // object form
  const rec = j as { name?: unknown };
  const nm = rec?.name;
  return typeof nm === "string" && nm.trim().length ? nm.trim() : null;
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
    const body: UpsertResponse = {
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
  const lineIdRaw = json?.workOrderLineId ?? "";

  if (!isUuid(lineIdRaw)) {
    const body: UpsertResponse = {
      ok: false,
      error: "bad_request",
      detail: "workOrderLineId must be a UUID",
    };
    return NextResponse.json(body, { status: 400 });
  }

  const lineId = lineIdRaw.trim();

  /* ---------------------------------------------------------------------- */
  /* 3) Load work_order_line                                                */
  /* ---------------------------------------------------------------------- */
  const { data: wol, error: wolErr } = await supabase
    .from("work_order_lines")
    .select("id, description, work_order_id, labor_time, template_id, notes")
    .eq("id", lineId)
    .maybeSingle();

  if (wolErr) {
    const body: UpsertResponse = {
      ok: false,
      error: "line_load_failed",
      detail: wolErr.message,
    };
    return NextResponse.json(body, { status: 500 });
  }

  if (!wol) {
    const body: UpsertResponse = {
      ok: false,
      error: "not_found",
      detail: "Work order line not found",
    };
    return NextResponse.json(body, { status: 404 });
  }

  if (!wol.work_order_id) {
    const body: UpsertResponse = {
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
    const body: UpsertResponse = {
      ok: false,
      error: "order_load_failed",
      detail: woErr.message,
    };
    return NextResponse.json(body, { status: 500 });
  }

  let shopId: string | null = wo?.shop_id ?? null;

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
    const body: UpsertResponse = {
      ok: false,
      error: "missing_shop",
      detail: "Cannot save menu item — missing shop for work order",
    };
    return NextResponse.json(body, { status: 400 });
  }

  // Set current shop context (for RLS policies that reference it)
  const { error: ctxErr } = await supabase.rpc("set_current_shop_id", { p_shop_id: shopId });
  if (ctxErr) {
    const body: UpsertResponse = {
      ok: false,
      error: "shop_context_failed",
      detail: ctxErr.message,
    };
    return NextResponse.json(body, { status: 403 });
  }

  const name =
    wol.description && wol.description.trim().length > 0 ? wol.description.trim() : null;

  if (!name) {
    const body: UpsertResponse = {
      ok: false,
      error: "missing_description",
      detail: "Cannot save menu item — missing description on line",
    };
    return NextResponse.json(body, { status: 400 });
  }

  /* ---------------------------------------------------------------------- */
  /* 5) Load line parts from allocations                                    */
  /* ---------------------------------------------------------------------- */
  const { data: rawAllocations, error: allocErr } = await supabase
    .from("work_order_part_allocations")
    .select("qty, unit_cost, part_id, parts(name)")
    .eq("work_order_line_id", wol.id);

  if (allocErr) {
    const body: UpsertResponse = {
      ok: false,
      error: "parts_load_failed",
      detail: allocErr.message,
    };
    return NextResponse.json(body, { status: 500 });
  }

  const allocations = (rawAllocations ?? []) as AllocationJoined[];

  const partsForMenu: Omit<MenuItemPartInsert, "menu_item_id">[] = [];
  let partCost = 0;

  for (const a of allocations) {
    const quantity = num(a.qty);
    const unitCost = num(a.unit_cost);
    const partId = a.part_id ? String(a.part_id) : null;

    if (quantity <= 0) continue;

    const rawName = partNameFromJoin(a.parts);
    const partName = rawName ?? "Part";

    partsForMenu.push({
      name: partName,
      quantity,
      unit_cost: unitCost,
      user_id: user.id,
      shop_id: shopId,
      part_id: partId,
    });

    partCost += quantity * unitCost;
  }

  const laborTime =
    typeof wol.labor_time === "number" && Number.isFinite(wol.labor_time)
      ? wol.labor_time
      : null;

  // IMPORTANT:
  // Do NOT compute/store total_price here anymore.
  // Your DB trigger on menu_items computes total_price based on:
  // part_cost + (labor_time * shops.labor_rate).
  //
  // So we store:
  // - labor_time
  // - part_cost
  // and let triggers compute total_price and labor_hours.
  //
  // We'll set total_price + labor_hours to null so trigger is the source of truth.
  const description = (wol.notes ?? wol.description ?? null) as string | null;

  /* ---------------------------------------------------------------------- */
  /* 6) Look for existing menu item (shop_id + name)                        */
  /* ---------------------------------------------------------------------- */
  const { data: existingMenu, error: existingErr } = await supabase
    .from("menu_items")
    .select("id")
    .eq("shop_id", shopId)
    .eq("name", name)
    .maybeSingle();

  if (existingErr) {
    const body: UpsertResponse = {
      ok: false,
      error: "existing_load_failed",
      detail: existingErr.message,
    };
    return NextResponse.json(body, { status: 500 });
  }

  /* ---------------------------------------------------------------------- */
  /* 7) Exists → update + replace parts                                     */
  /* ---------------------------------------------------------------------- */
  if (existingMenu?.id) {
    const menuItemId = existingMenu.id;

    const updatePayload: MenuItemUpdate = {
      name,
      description,
      labor_time: laborTime,
      // trigger will set labor_hours
      labor_hours: null,
      part_cost: partCost > 0 ? partCost : 0,
      // trigger will set total_price
      total_price: null,
      inspection_template_id: wol.template_id ?? null,
      is_active: true,
      shop_id: shopId,
      work_order_line_id: wol.id,
    };

    const { error: updErr } = await supabase
      .from("menu_items")
      .update(updatePayload)
      .eq("id", menuItemId);

    if (updErr) {
      const body: UpsertResponse = {
        ok: false,
        error: "update_failed",
        detail: updErr.message,
      };
      return NextResponse.json(body, { status: 500 });
    }

    // Replace parts: delete old → insert new
    const { error: delErr } = await supabase
      .from("menu_item_parts")
      .delete()
      .eq("menu_item_id", menuItemId);

    if (delErr) {
      const body: UpsertResponse = {
        ok: false,
        error: "parts_delete_failed",
        detail: delErr.message,
      };
      return NextResponse.json(body, { status: 500 });
    }

    if (partsForMenu.length > 0) {
      const partsInsert: MenuItemPartInsert[] = partsForMenu.map((p) => ({
        ...p,
        menu_item_id: menuItemId,
      }));

      const { error: partsInsertErr } = await supabase
        .from("menu_item_parts")
        .insert(partsInsert);

      if (partsInsertErr) {
        const body: UpsertResponse = {
          ok: false,
          error: "parts_insert_failed",
          detail: partsInsertErr.message,
        };
        return NextResponse.json(body, { status: 500 });
      }
    }

    const body: UpsertResponse = { ok: true, menuItemId, updated: true };
    return NextResponse.json(body, { status: 200 });
  }

  /* ---------------------------------------------------------------------- */
  /* 8) No existing menu item → create new                                  */
  /* ---------------------------------------------------------------------- */
  const insertPayload: MenuItemInsert = {
    name,
    description,
    labor_time: laborTime,
    // trigger will set labor_hours
    labor_hours: null,
    part_cost: partCost > 0 ? partCost : 0,
    // trigger will set total_price
    total_price: null,
    inspection_template_id: wol.template_id ?? null,
    user_id: user.id,
    is_active: true,
    shop_id: shopId,
    work_order_line_id: wol.id,
  };

  const { data: created, error: insErr } = await supabase
    .from("menu_items")
    .insert(insertPayload)
    .select("id")
    .single();

  if (insErr || !created?.id) {
    const body: UpsertResponse = {
      ok: false,
      error: "insert_failed",
      detail: insErr?.message ?? "Failed to create menu item",
    };
    return NextResponse.json(body, { status: 500 });
  }

  if (partsForMenu.length > 0) {
    const partsInsert: MenuItemPartInsert[] = partsForMenu.map((p) => ({
      ...p,
      menu_item_id: created.id,
    }));

    const { error: partsInsertErr } = await supabase
      .from("menu_item_parts")
      .insert(partsInsert);

    if (partsInsertErr) {
      const body: UpsertResponse = {
        ok: false,
        error: "parts_insert_failed",
        detail: partsInsertErr.message,
      };
      return NextResponse.json(body, { status: 500 });
    }
  }

  const body: UpsertResponse = { ok: true, menuItemId: created.id, updated: false };
  return NextResponse.json(body, { status: 200 });
}