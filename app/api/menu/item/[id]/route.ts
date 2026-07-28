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
import { createServerSupabaseRoute } from "@/features/shared/lib/supabase/server";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

export const runtime = "nodejs";

type PatchBody = {
  item?: {
    name?: string;
    description?: string | null;
    labor_time?: number | null;
    inspection_template_id?: string | null;
    is_active?: boolean;
  };
  parts?: {
    id?: string;
    name: string;
    quantity: number;
    unit_cost: number;
    part_id?: string | null;
  }[];
};

type Params = { id: string };
type Ctx = { params: Promise<Params> };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MENU_EDITOR_ROLES = [
  "owner",
  "admin",
  "manager",
  "advisor",
  "service",
  "parts",
  "mechanic",
  "lead_hand",
  "foreman",
] as const;

type UpdateResult = {
  ok?: boolean;
  menu_item_id?: string;
  part_request_id?: string | null;
  part_count?: number;
  intake_complete?: boolean;
};

type DeleteResult = {
  ok?: boolean;
  menu_item_id?: string;
  part_request_id?: string | null;
};

async function setShopContext(supabase: ReturnType<typeof createServerSupabaseRoute>, shopId: string) {
  const { error } = await supabase.rpc("set_current_shop_id", { p_shop_id: shopId });
  return error ? error.message : null;
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const access = await requireShopScopedApiAccess({
    allowRoles: MENU_EDITOR_ROLES,
  });
  if (!access.ok) return access.response;

  const supabase = access.supabase;
  const { id } = await ctx.params;
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json(
      { ok: false, error: "bad_request", detail: "Menu item id is invalid." },
      { status: 400 },
    );
  }

  const contextError = await setShopContext(
    supabase,
    access.profile.shop_id,
  );
  if (contextError) {
    return NextResponse.json(
      {
        ok: false,
        error: "shop_context_failed",
        detail: contextError,
      },
      { status: 403 },
    );
  }

  const { data: item, error: itemErr } = await supabase
    .from("menu_items")
    .select("*")
    .eq("id", id)
    .eq("shop_id", access.profile.shop_id)
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

  const { data: parts, error: partsErr } = await supabase
    .from("menu_item_parts")
    .select("*")
    .eq("menu_item_id", id)
    .eq("shop_id", access.profile.shop_id)
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
  const access = await requireShopScopedApiAccess({
    allowRoles: MENU_EDITOR_ROLES,
  });
  if (!access.ok) return access.response;

  const { id } = await ctx.params;
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json(
      { ok: false, error: "bad_request", detail: "Menu item id is invalid." },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => null)) as PatchBody | null;
  if (!body) {
    return NextResponse.json(
      { ok: false, error: "bad_request", detail: "Missing body" },
      { status: 400 },
    );
  }

  const name = body.item?.name?.trim();
  if (name !== undefined && (!name || name.length > 180)) {
    return NextResponse.json(
      {
        ok: false,
        error: "bad_request",
        detail: "Menu item name is required and must be 180 characters or fewer.",
      },
      { status: 400 },
    );
  }
  if (
    body.item?.labor_time !== undefined &&
    body.item.labor_time !== null &&
    (!Number.isFinite(body.item.labor_time) || body.item.labor_time < 0)
  ) {
    return NextResponse.json(
      { ok: false, error: "bad_request", detail: "Labor time must be zero or greater." },
      { status: 400 },
    );
  }
  const templateId = body.item?.inspection_template_id?.trim() || null;
  if (templateId && !UUID_PATTERN.test(templateId)) {
    return NextResponse.json(
      { ok: false, error: "bad_request", detail: "Inspection template is invalid." },
      { status: 400 },
    );
  }

  if (body.parts && body.parts.length > 100) {
    return NextResponse.json(
      { ok: false, error: "bad_request", detail: "A menu item can contain at most 100 parts." },
      { status: 400 },
    );
  }
  const cleanedParts = body.parts?.map((part) => ({
    id: part.id?.trim() || "",
    name: part.name?.trim() || "",
    quantity: part.quantity,
    unit_cost: part.unit_cost,
    part_id: part.part_id?.trim() || null,
  }));
  const invalidPart = cleanedParts?.find(
    (part) =>
      !UUID_PATTERN.test(part.id) ||
      !part.name ||
      part.name.length > 240 ||
      !Number.isFinite(part.quantity) ||
      part.quantity <= 0 ||
      !Number.isFinite(part.unit_cost) ||
      part.unit_cost < 0 ||
      (part.part_id !== null && !UUID_PATTERN.test(part.part_id)),
  );
  if (invalidPart) {
    return NextResponse.json(
      {
        ok: false,
        error: "bad_request",
        detail:
          "Every part needs a stable id, valid name, positive quantity, and non-negative unit cost.",
      },
      { status: 400 },
    );
  }

  const rpc = access.supabase.rpc as unknown as (
    functionName: string,
    args: Record<string, unknown>,
  ) => Promise<{
    data: UpdateResult | null;
    error: { message: string } | null;
  }>;
  const { data, error } = await rpc("update_menu_item_with_parts_intake", {
    p_shop_id: access.profile.shop_id,
    p_actor_profile_id: access.profile.id,
    p_actor_auth_user_id: access.authUserId,
    p_menu_item_id: id,
    p_item: {
      ...(name !== undefined ? { name } : {}),
      ...(body.item?.description !== undefined
        ? { description: body.item.description?.trim() || null }
        : {}),
      ...(body.item?.labor_time !== undefined
        ? { labor_time: body.item.labor_time }
        : {}),
      ...(body.item?.inspection_template_id !== undefined
        ? { inspection_template_id: templateId }
        : {}),
      ...(body.item?.is_active !== undefined
        ? { is_active: body.item.is_active }
        : {}),
    },
    p_parts: cleanedParts ?? null,
  });

  if (error || !data?.ok) {
    const detail = error?.message ?? "Menu item update failed.";
    const status = /not authorized|identity|member|available to this shop/i.test(
      detail,
    )
      ? 403
      : /not found/i.test(detail)
        ? 404
        : /required|must be|too long|duplicate|positive|negative/i.test(detail)
          ? 400
          : 500;
    return NextResponse.json(
      { ok: false, error: "update_failed", detail },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    id: data.menu_item_id,
    partRequestId: data.part_request_id ?? null,
    partCount: Number(data.part_count ?? cleanedParts?.length ?? 0),
    intakeComplete: Boolean(data.intake_complete),
  });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const access = await requireShopScopedApiAccess({
    allowRoles: MENU_EDITOR_ROLES,
  });
  if (!access.ok) return access.response;

  const { id } = await ctx.params;
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json(
      { ok: false, error: "bad_request", detail: "Menu item id is invalid." },
      { status: 400 },
    );
  }

  const rpc = access.supabase.rpc as unknown as (
    functionName: string,
    args: Record<string, unknown>,
  ) => Promise<{
    data: DeleteResult | null;
    error: { message: string } | null;
  }>;
  const { data, error } = await rpc("delete_menu_item_with_parts_intake", {
    p_shop_id: access.profile.shop_id,
    p_actor_profile_id: access.profile.id,
    p_actor_auth_user_id: access.authUserId,
    p_menu_item_id: id,
  });

  if (error || !data?.ok) {
    const detail = error?.message ?? "Menu item deletion failed.";
    const status = /not authorized|identity|member/i.test(detail)
      ? 403
      : /not found/i.test(detail)
        ? 404
        : /required/i.test(detail)
          ? 400
          : 500;
    return NextResponse.json(
      { ok: false, error: "delete_failed", detail },
      { status },
    );
  }

  return NextResponse.json({
    ok: true,
    id: data.menu_item_id,
    cancelledPartRequestId: data.part_request_id ?? null,
  });
}
