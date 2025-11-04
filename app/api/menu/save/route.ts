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

  // 4) build row to insert
  const itemInsert: MenuInsert = {
    name: body.item.name,
    description: body.item.description,
    labor_time: body.item.labor_time,
    labor_hours: null,
    part_cost: body.item.part_cost,
    total_price: body.item.total_price,
    inspection_template_id: body.item.inspection_template_id,
    user_id: user?.id ?? null,
    is_active: true,
    shop_id: shopId, // <-- important for RLS
  };

  console.log("[API menu/save] inserting", itemInsert);

  // 5) insert menu item
  const { data: created, error: itemErr } = await supabase
    .from("menu_items")
    .insert(itemInsert)
    .select("id")
    .single();

  if (itemErr || !created) {
    console.error("[API menu/save] insert failed:", itemErr);
    // Send the actual Supabase error back so you see it in the UI
    return NextResponse.json(
      {
        ok: false,
        error: "insert_failed",
        detail: itemErr?.message ?? "insert failed",
      },
      { status: 400 },
    );
  }

  // 6) insert parts (respect RLS on menu_item_parts: it wants user_id = auth.uid())
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
        // we won't hard-fail for parts; item was created already
      }
    }
  }

  return NextResponse.json({ ok: true, id: created.id });
}