// app/api/menu/item/[id]/route.ts (FULL FILE REPLACEMENT)
// Next.js 15 route handler params are async (Promise)
// Fixes: "invalid GET export" type error on Vercel
//
// Consistency rules:
// - totals (part_cost, total_price) are computed server-side
// - total_price = partsSubtotal + (labor_time * shops.labor_rate)
// - parts schema: menu_item_parts includes shop_id + part_id

import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export const runtime = "nodejs";

type DB = Database;

type MenuItemUpdate = DB["public"]["Tables"]["menu_items"]["Update"];
type MenuItemPartInsert = DB["public"]["Tables"]["menu_item_parts"]["Insert"];

type ShopRow = DB["public"]["Tables"]["shops"]["Row"];

type PatchBody = {
  item?: {
    name?: string;
    description?: string | null;
    labor_time?: number | null;
    inspection_template_id?: string | null;
    is_active?: boolean;
  };
  parts?: {
    name: string;
    quantity: number;
    unit_cost: number;
    part_id?: string | null;
  }[];
};

type Params = { id: string };
type Ctx = { params: Promise<Params> };

function clampNonNeg(n: number): number {
  return n < 0 ? 0 : n;
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function toShopId(v: unknown): string | null {
  return typeof v === "string" && v.trim().length ? v.trim() : null;
}

async function setShopContext(supabase: ReturnType<typeof createRouteHandlerClient<DB>>, shopId: string) {
  const { error } = await supabase.rpc("set_current_shop_id", { p_shop_id: shopId });
  return error ? error.message : null;
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const supabase = createRouteHandlerClient<DB>({ cookies });
  const { id } = await ctx.params;

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

  const { data: item, error: itemErr } = await supabase
    .from("menu_items")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (itemErr) {
    return NextResponse.json(
      { ok: false, error: "load_failed", detail: itemErr.message },
      { status: 500 },
    );
  }
  if (!item) {
    return NextResponse.json(
      { ok: false, error: "not_found", detail: "Menu item not found" },
      { status: 404 },
    );
  }

  const shopId = toShopId(item.shop_id);
  if (shopId) {
    const msg = await setShopContext(supabase, shopId);
    if (msg) {
      return NextResponse.json(
        { ok: false, error: "shop_context_failed", detail: msg },
        { status: 403 },
      );
    }
  }

  const { data: parts, error: partsErr } = await supabase
    .from("menu_item_parts")
    .select("*")
    .eq("menu_item_id", id)
    .order("created_at", { ascending: true });

  if (partsErr) {
    return NextResponse.json(
      { ok: false, error: "parts_load_failed", detail: partsErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, item, parts: parts ?? [] });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const supabase = createRouteHandlerClient<DB>({ cookies });
  const { id } = await ctx.params;

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

  const body = (await req.json().catch(() => null)) as PatchBody | null;
  if (!body) {
    return NextResponse.json(
      { ok: false, error: "bad_request", detail: "Missing body" },
      { status: 400 },
    );
  }

  // Load item to get shop_id (and also validate existence)
  const { data: existing, error: itemErr } = await supabase
    .from("menu_items")
    .select("id, shop_id, labor_time")
    .eq("id", id)
    .maybeSingle();

  if (itemErr) {
    return NextResponse.json(
      { ok: false, error: "load_failed", detail: itemErr.message },
      { status: 500 },
    );
  }
  if (!existing) {
    return NextResponse.json(
      { ok: false, error: "not_found", detail: "Menu item not found" },
      { status: 404 },
    );
  }

  const shopId = toShopId(existing.shop_id);
  if (!shopId) {
    return NextResponse.json(
      { ok: false, error: "missing_shop", detail: "Menu item missing shop_id" },
      { status: 400 },
    );
  }

  const ctxMsg = await setShopContext(supabase, shopId);
  if (ctxMsg) {
    return NextResponse.json(
      { ok: false, error: "shop_context_failed", detail: ctxMsg },
      { status: 403 },
    );
  }

  // Load shop labor rate (server truth for totals)
  const { data: shop, error: shopErr } = await supabase
    .from("shops")
    .select("labor_rate")
    .eq("id", shopId)
    .maybeSingle<Pick<ShopRow, "labor_rate">>();

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

  // If parts are provided, replace them and compute totals from provided set.
  // If parts are NOT provided, compute totals from existing parts in DB.
  let partsSubtotal = 0;

  if (Array.isArray(body.parts)) {
    // replace parts
    const { error: delErr } = await supabase
      .from("menu_item_parts")
      .delete()
      .eq("menu_item_id", id);

    if (delErr) {
      return NextResponse.json(
        { ok: false, error: "parts_delete_failed", detail: delErr.message },
        { status: 500 },
      );
    }

    const cleaned = body.parts
      .map((p) => {
        const name = typeof p.name === "string" ? p.name.trim() : "";
        const qty = numOrNull(p.quantity);
        const unit = numOrNull(p.unit_cost);
        const partId = toShopId(p.part_id);

        return {
          name,
          quantity: qty != null ? clampNonNeg(qty) : 0,
          unit_cost: unit != null ? clampNonNeg(unit) : 0,
          part_id: partId,
        };
      })
      .filter((p) => p.name.length > 0 && p.quantity > 0);

    partsSubtotal = cleaned.reduce((sum, p) => sum + p.quantity * p.unit_cost, 0);

    const partsInsert: MenuItemPartInsert[] = cleaned.map((p) => ({
      menu_item_id: id,
      name: p.name,
      quantity: p.quantity,
      unit_cost: p.unit_cost,
      user_id: user.id,
      shop_id: shopId,
      part_id: p.part_id ?? null,
    }));

    if (partsInsert.length) {
      const { error: insErr } = await supabase.from("menu_item_parts").insert(partsInsert);
      if (insErr) {
        return NextResponse.json(
          { ok: false, error: "parts_insert_failed", detail: insErr.message },
          { status: 500 },
        );
      }
    }
  } else {
    // compute from existing parts
    const { data: parts, error: partsErr } = await supabase
      .from("menu_item_parts")
      .select("quantity, unit_cost")
      .eq("menu_item_id", id);

    if (partsErr) {
      return NextResponse.json(
        { ok: false, error: "parts_load_failed", detail: partsErr.message },
        { status: 500 },
      );
    }

    partsSubtotal = (parts ?? []).reduce((sum, p) => {
      const q = typeof p.quantity === "number" && Number.isFinite(p.quantity) ? p.quantity : 0;
      const u = typeof p.unit_cost === "number" && Number.isFinite(p.unit_cost) ? p.unit_cost : 0;
      return sum + clampNonNeg(q) * clampNonNeg(u);
    }, 0);
  }

  // Labor hours after patch (fallback to existing)
  const laborTimePatched =
    body.item?.labor_time !== undefined
      ? (body.item.labor_time != null ? clampNonNeg(body.item.labor_time) : null)
      : (typeof existing.labor_time === "number" && Number.isFinite(existing.labor_time)
          ? clampNonNeg(existing.labor_time)
          : null);

  const laborCost = (laborTimePatched ?? 0) * laborRate;
  const totalPrice = partsSubtotal + laborCost;

  const update: MenuItemUpdate = {
    ...(body.item?.name != null ? { name: body.item.name } : {}),
    ...(body.item?.description !== undefined ? { description: body.item.description } : {}),
    ...(body.item?.labor_time !== undefined
      ? { labor_time: laborTimePatched, labor_hours: laborTimePatched }
      : {}),
    ...(body.item?.inspection_template_id !== undefined
      ? { inspection_template_id: body.item.inspection_template_id }
      : {}),
    ...(body.item?.is_active !== undefined ? { is_active: body.item.is_active } : {}),

    // server-truth totals:
    part_cost: partsSubtotal,
    total_price: totalPrice,
  };

  const { error: updErr } = await supabase.from("menu_items").update(update).eq("id", id);
  if (updErr) {
    return NextResponse.json(
      { ok: false, error: "update_failed", detail: updErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const supabase = createRouteHandlerClient<DB>({ cookies });
  const { id } = await ctx.params;

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

  const { data: item, error: itemErr } = await supabase
    .from("menu_items")
    .select("id, shop_id")
    .eq("id", id)
    .maybeSingle();

  if (itemErr) {
    return NextResponse.json(
      { ok: false, error: "load_failed", detail: itemErr.message },
      { status: 500 },
    );
  }
  if (!item) {
    return NextResponse.json(
      { ok: false, error: "not_found", detail: "Menu item not found" },
      { status: 404 },
    );
  }

  const shopId = toShopId(item.shop_id);
  if (shopId) {
    const msg = await setShopContext(supabase, shopId);
    if (msg) {
      return NextResponse.json(
        { ok: false, error: "shop_context_failed", detail: msg },
        { status: 403 },
      );
    }
  }

  // Delete children first (safe even if FK cascade exists)
  const { error: partsDelErr } = await supabase
    .from("menu_item_parts")
    .delete()
    .eq("menu_item_id", id);

  if (partsDelErr) {
    return NextResponse.json(
      { ok: false, error: "parts_delete_failed", detail: partsDelErr.message },
      { status: 500 },
    );
  }

  const { error: delErr } = await supabase.from("menu_items").delete().eq("id", id);
  if (delErr) {
    return NextResponse.json(
      { ok: false, error: "delete_failed", detail: delErr.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}