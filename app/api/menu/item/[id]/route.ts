// NEW: app/api/menu/item/[id]/route.ts
import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

export const runtime = "nodejs";

type DB = Database;

type MenuItemUpdate = DB["public"]["Tables"]["menu_items"]["Update"];
type MenuItemPartInsert = DB["public"]["Tables"]["menu_item_parts"]["Insert"];

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

export async function GET(_req: NextRequest, ctx: { params: { id: string } }) {
  const supabase = createRouteHandlerClient<DB>({ cookies });
  const id = ctx.params.id;

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
    return NextResponse.json({ ok: false, error: "load_failed", detail: itemErr.message }, { status: 500 });
  }
  if (!item) {
    return NextResponse.json({ ok: false, error: "not_found", detail: "Menu item not found" }, { status: 404 });
  }

  // Set shop context for subsequent reads (if your RLS uses current_shop_id)
  const shopId = (item.shop_id as string | null) ?? null;
  if (shopId) {
    const { error: ctxErr } = await supabase.rpc("set_current_shop_id", { p_shop_id: shopId });
    if (ctxErr) {
      return NextResponse.json({ ok: false, error: "shop_context_failed", detail: ctxErr.message }, { status: 403 });
    }
  }

  const { data: parts, error: partsErr } = await supabase
    .from("menu_item_parts")
    .select("*")
    .eq("menu_item_id", id)
    .order("created_at", { ascending: true });

  if (partsErr) {
    return NextResponse.json({ ok: false, error: "parts_load_failed", detail: partsErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, item, parts: parts ?? [] });
}

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  const supabase = createRouteHandlerClient<DB>({ cookies });
  const id = ctx.params.id;

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
    return NextResponse.json({ ok: false, error: "bad_request", detail: "Missing body" }, { status: 400 });
  }

  const { data: item, error: itemErr } = await supabase
    .from("menu_items")
    .select("id, shop_id")
    .eq("id", id)
    .maybeSingle();

  if (itemErr) {
    return NextResponse.json({ ok: false, error: "load_failed", detail: itemErr.message }, { status: 500 });
  }
  if (!item) {
    return NextResponse.json({ ok: false, error: "not_found", detail: "Menu item not found" }, { status: 404 });
  }

  const shopId = (item.shop_id as string | null) ?? null;
  if (shopId) {
    const { error: ctxErr } = await supabase.rpc("set_current_shop_id", { p_shop_id: shopId });
    if (ctxErr) {
      return NextResponse.json({ ok: false, error: "shop_context_failed", detail: ctxErr.message }, { status: 403 });
    }
  }

  const update: MenuItemUpdate = {
    ...(body.item?.name != null ? { name: body.item.name } : {}),
    ...(body.item?.description !== undefined ? { description: body.item.description } : {}),
    ...(body.item?.labor_time !== undefined ? { labor_time: body.item.labor_time } : {}),
    ...(body.item?.inspection_template_id !== undefined
      ? { inspection_template_id: body.item.inspection_template_id }
      : {}),
    ...(body.item?.is_active !== undefined ? { is_active: body.item.is_active } : {}),
  };

  if (Object.keys(update).length) {
    const { error: updErr } = await supabase.from("menu_items").update(update).eq("id", id);
    if (updErr) {
      return NextResponse.json({ ok: false, error: "update_failed", detail: updErr.message }, { status: 500 });
    }
  }

  // Replace parts if provided
  if (Array.isArray(body.parts)) {
    const { error: delErr } = await supabase.from("menu_item_parts").delete().eq("menu_item_id", id);
    if (delErr) {
      return NextResponse.json({ ok: false, error: "parts_delete_failed", detail: delErr.message }, { status: 500 });
    }

    const partsInsert: MenuItemPartInsert[] = body.parts
      .filter((p) => p.name && p.quantity > 0)
      .map((p) => ({
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
        return NextResponse.json({ ok: false, error: "parts_insert_failed", detail: insErr.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: { params: { id: string } }) {
  const supabase = createRouteHandlerClient<DB>({ cookies });
  const id = ctx.params.id;

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
    return NextResponse.json({ ok: false, error: "load_failed", detail: itemErr.message }, { status: 500 });
  }
  if (!item) {
    return NextResponse.json({ ok: false, error: "not_found", detail: "Menu item not found" }, { status: 404 });
  }

  const shopId = (item.shop_id as string | null) ?? null;
  if (shopId) {
    const { error: ctxErr } = await supabase.rpc("set_current_shop_id", { p_shop_id: shopId });
    if (ctxErr) {
      return NextResponse.json({ ok: false, error: "shop_context_failed", detail: ctxErr.message }, { status: 403 });
    }
  }

  // Delete children first (safe even if FK cascade exists)
  const { error: partsDelErr } = await supabase.from("menu_item_parts").delete().eq("menu_item_id", id);
  if (partsDelErr) {
    return NextResponse.json({ ok: false, error: "parts_delete_failed", detail: partsDelErr.message }, { status: 500 });
  }

  const { error: delErr } = await supabase.from("menu_items").delete().eq("id", id);
  if (delErr) {
    return NextResponse.json({ ok: false, error: "delete_failed", detail: delErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}