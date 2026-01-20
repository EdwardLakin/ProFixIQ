// app/api/menu/save/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type MenuInsert = DB["public"]["Tables"]["menu_items"]["Insert"];
type MenuItemPartInsert = DB["public"]["Tables"]["menu_item_parts"]["Insert"];

export const runtime = "nodejs";

type IncomingBody =
  | {
      item: {
        name: string;
        description: string | null;
        labor_time: number | null;
        part_cost: number | null; // ignored (server computes)
        total_price: number | null; // ignored (server computes)
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

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function clampNonNeg(n: number): number {
  return n < 0 ? 0 : n;
}

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

  const body = (await req.json().catch(() => null)) as IncomingBody;

  const rawName = body?.item?.name;
  const name = typeof rawName === "string" ? rawName.trim() : "";

  if (!name) {
    return NextResponse.json(
      { ok: false, error: "bad_request", detail: "name is required" },
      { status: 400 },
    );
  }

  // Determine shop_id (RLS scoping)
  let shopId: string | null =
    typeof body?.item?.shop_id === "string" && body.item.shop_id.trim().length
      ? body.item.shop_id.trim()
      : null;

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

  if (!shopId) {
    return NextResponse.json(
      { ok: false, error: "missing_shop", detail: "Missing shop context (shop_id)." },
      { status: 400 },
    );
  }

  // Set session shop context for RLS policies that reference current_shop_id()
  const { error: ctxErr } = await supabase.rpc("set_current_shop_id", { p_shop_id: shopId });
  if (ctxErr) {
    return NextResponse.json(
      { ok: false, error: "shop_context_failed", detail: ctxErr.message },
      { status: 403 },
    );
  }

  // Load shop defaults (labor_rate is the one we need here)
  const { data: shop, error: shopErr } = await supabase
    .from("shops")
    .select("labor_rate")
    .eq("id", shopId)
    .maybeSingle();

  if (shopErr) {
    return NextResponse.json(
      { ok: false, error: "shop_load_failed", detail: shopErr.message },
      { status: 500 },
    );
  }

  const laborRate =
    typeof shop?.labor_rate === "number" && Number.isFinite(shop.labor_rate)
      ? shop.labor_rate
      : 0;

  const laborHours = numOrNull(body?.item?.labor_time);
  const safeLaborHours = laborHours != null ? clampNonNeg(laborHours) : null;

  // Compute parts subtotal from payload (server truth)
  const incomingParts = Array.isArray(body?.parts) ? body?.parts : [];
  const cleanedParts = incomingParts
    .map((p) => {
      const partName = typeof p?.name === "string" ? p.name.trim() : "";
      const qty = numOrNull(p?.quantity);
      const unit = numOrNull(p?.unit_cost);
      const partId =
        typeof p?.part_id === "string" && p.part_id.trim().length ? p.part_id.trim() : null;

      return {
        name: partName,
        quantity: qty != null ? clampNonNeg(qty) : 0,
        unit_cost: unit != null ? clampNonNeg(unit) : 0,
        part_id: partId,
      };
    })
    .filter((p) => p.name.length > 0 && p.quantity > 0);

  const partCost = cleanedParts.reduce((sum, p) => sum + p.quantity * p.unit_cost, 0);
  const laborCost = (safeLaborHours ?? 0) * laborRate;

  // Menu items store subtotal (no tax here)
  const totalPrice = partCost + laborCost;

  const desc =
    typeof body?.item?.description === "string"
      ? body.item.description.trim()
      : body?.item?.description === null
        ? null
        : null;

  const inspectionTemplateId =
    typeof body?.item?.inspection_template_id === "string" && body.item.inspection_template_id
      ? body.item.inspection_template_id
      : null;

  const itemInsert: MenuInsert = {
    name,
    description: desc && desc.length ? desc : null,
    labor_time: safeLaborHours,
    labor_hours: safeLaborHours, // keep consistent if column exists
    part_cost: partCost,
    total_price: totalPrice,
    inspection_template_id: inspectionTemplateId,
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

  // Insert parts (consistent schema: shop_id + part_id)
  if (cleanedParts.length > 0) {
    const partsInsert: MenuItemPartInsert[] = cleanedParts.map((p) => ({
      menu_item_id: created.id,
      name: p.name,
      quantity: p.quantity,
      unit_cost: p.unit_cost,
      user_id: user.id,
      shop_id: created.shop_id ?? shopId,
      part_id: p.part_id ?? null,
    }));

    const { error: partsErr } = await supabase.from("menu_item_parts").insert(partsInsert);
    if (partsErr) {
      console.warn("[API menu/save] parts insert failed:", partsErr.message);
      // Do not fail the whole request: menu item exists
    }
  }

  return NextResponse.json({ ok: true, id: created.id });
}