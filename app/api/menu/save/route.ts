// app/api/menu/save/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type MenuInsert = DB["public"]["Tables"]["menu_items"]["Insert"];
type MenuItemPartInsert = DB["public"]["Tables"]["menu_item_parts"]["Insert"];

export const runtime = "nodejs";

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return NextResponse.json(
      { ok: false, error: "auth_error", detail: userErr?.message ?? "Not signed in" },
      { status: 401 },
    );
  }

  const body = (await req.json().catch(() => null)) as
    | {
        item: {
          name: string;
          description: string | null;
          labor_time: number | null;
          part_cost: number | null;
          total_price: number | null;
          inspection_template_id: string | null;
          shop_id?: string | null;
        };
        parts?: {
          name: string;
          quantity: number;
          unit_cost: number;
          part_id?: string | null;
        }[];
      }
    | null;

  if (!body?.item?.name) {
    return NextResponse.json(
      { ok: false, error: "bad_request", detail: "name is required" },
      { status: 400 },
    );
  }

  // Determine shop_id (RLS scoping)
  let shopId: string | null = body.item.shop_id ?? null;

  if (!shopId) {
    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("shop_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profErr) {
      console.warn("[API menu/save] profile lookup failed:", profErr.message);
    } else {
      shopId = (prof?.shop_id as string | null) ?? null;
    }
  }

  // Set session shop context for RLS policies that reference current_shop_id()
  if (shopId) {
    const { error: ctxErr } = await supabase.rpc("set_current_shop_id", { p_shop_id: shopId });
    if (ctxErr) {
      return NextResponse.json(
        { ok: false, error: "shop_context_failed", detail: ctxErr.message },
        { status: 403 },
      );
    }
  }

  const laborHours =
    typeof body.item.labor_time === "number" && Number.isFinite(body.item.labor_time)
      ? body.item.labor_time
      : null;

  const partCost =
    typeof body.item.part_cost === "number" && Number.isFinite(body.item.part_cost)
      ? body.item.part_cost
      : null;

  const totalPrice =
    typeof body.item.total_price === "number" && Number.isFinite(body.item.total_price)
      ? body.item.total_price
      : null;

  const itemInsert: MenuInsert = {
    name: body.item.name,
    description: body.item.description,
    labor_time: laborHours,
    labor_hours: laborHours,
    part_cost: partCost,
    total_price: totalPrice,
    inspection_template_id: body.item.inspection_template_id,
    user_id: user.id,
    is_active: true,
    shop_id: shopId,
  };

  const { data: created, error: itemErr } = await supabase
    .from("menu_items")
    .insert(itemInsert)
    .select("id, shop_id")
    .single();

  if (itemErr || !created) {
    return NextResponse.json(
      { ok: false, error: "insert_failed", detail: itemErr?.message ?? "insert failed" },
      { status: 400 },
    );
  }

  // Insert parts
  if (Array.isArray(body.parts) && body.parts.length > 0) {
    const partsInsert = body.parts
      .filter((p) => p.name && p.quantity > 0)
      .map<MenuItemPartInsert>((p) => ({
        menu_item_id: created.id,
        name: p.name,
        quantity: p.quantity,
        unit_cost: p.unit_cost,
        user_id: user.id,
        // NEW schema (recommended): shop_id + part_id
        shop_id: created.shop_id ?? shopId,
        part_id: p.part_id ?? null,
      }));

    if (partsInsert.length) {
      const { error: partsErr } = await supabase.from("menu_item_parts").insert(partsInsert);
      if (partsErr) {
        console.warn("[API menu/save] parts insert failed:", partsErr.message);
      }
    }
  }

  return NextResponse.json({ ok: true, id: created.id });
}