// app/api/menu/save/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type MenuInsert = DB["public"]["Tables"]["menu_items"]["Insert"];

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  // 1) who is calling?
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) {
    console.error("[API menu/save] auth error:", userErr);
    return NextResponse.json(
      { ok: false, error: "auth_error", detail: userErr.message },
      { status: 401 },
    );
  }

  // 2) body from client
  const body = (await req.json()) as {
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
    }[];
  };

  if (!body?.item?.name) {
    return NextResponse.json(
      { ok: false, error: "bad_request", detail: "name is required" },
      { status: 400 },
    );
  }

  // 3) figure out shop_id the RLS wants
  let shopId: string | null =
    body.item.shop_id != null ? body.item.shop_id : null;

  // If caller didn’t send one, try to look it up from user's profile
  if (!shopId && user) {
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

  // 4) normalize numeric fields
  const laborHours =
    typeof body.item.labor_time === "number" &&
    Number.isFinite(body.item.labor_time)
      ? body.item.labor_time
      : null;

  const partCost =
    typeof body.item.part_cost === "number" &&
    Number.isFinite(body.item.part_cost)
      ? body.item.part_cost
      : null;

  const totalPrice =
    typeof body.item.total_price === "number" &&
    Number.isFinite(body.item.total_price)
      ? body.item.total_price
      : null;

  // 5) build row to insert (full info)
  const itemInsert: MenuInsert = {
    name: body.item.name,
    description: body.item.description,
    // keep legacy field + new field in sync
    labor_time: laborHours,
    labor_hours: laborHours,
    part_cost: partCost,
    total_price: totalPrice,
    inspection_template_id: body.item.inspection_template_id,
    user_id: user?.id ?? null,
    is_active: true,
    shop_id: shopId,
  };

  console.log("[API menu/save] inserting", itemInsert);

  // 6) insert menu item
  const { data: created, error: itemErr } = await supabase
    .from("menu_items")
    .insert(itemInsert)
    .select("id")
    .single();

  if (itemErr || !created) {
    console.error("[API menu/save] insert failed:", itemErr);
    return NextResponse.json(
      {
        ok: false,
        error: "insert_failed",
        detail: itemErr?.message ?? "insert failed",
      },
      { status: 400 },
    );
  }

  // 7) insert parts (respect RLS on menu_item_parts: it wants user_id = auth.uid())
  if (Array.isArray(body.parts) && body.parts.length > 0) {
    const partsInsert = body.parts
      .filter((p) => p.name && p.quantity > 0)
      .map((p) => ({
        menu_item_id: created.id,
        name: p.name,
        quantity: p.quantity,
        unit_cost: p.unit_cost,
        user_id: user?.id ?? null,
      }));

    if (partsInsert.length) {
      const { error: partsErr } = await supabase
        .from("menu_item_parts")
        .insert(partsInsert);

      if (partsErr) {
        console.warn(
          "[API menu/save] parts insert failed:",
          partsErr.message,
        );
        // item is still created; we don't hard-fail on parts
      }
    }
  }

  return NextResponse.json({ ok: true, id: created.id });
}