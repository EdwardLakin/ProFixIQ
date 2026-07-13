import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@shared/types/types/supabase";
import { requireShopScopedApiAccess } from "@/features/shared/lib/server/admin-access";

type DB = Database;
type PartRequestItem = DB["public"]["Tables"]["part_request_items"]["Row"];

type ItemResult =
  | { itemId: string; status: "committed" | "already_committed"; workOrderPartId: string }
  | { itemId: string; status: "skipped"; reason: string }
  | { itemId: string; status: "error"; error: string };

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

type CommitQuantitySource = Pick<PartRequestItem, "qty_requested" | "qty">;

export function resolvePackageCommitQuantity(item: CommitQuantitySource): number {
  const requested = typeof item.qty_requested === "number" ? item.qty_requested : Number(item.qty_requested);
  if (Number.isFinite(requested) && requested > 0) return requested;
  const legacy = typeof item.qty === "number" ? item.qty : Number(item.qty);
  if (Number.isFinite(legacy) && legacy > 0) return legacy;
  return 0;
}

function positiveQuantity(item: PartRequestItem): number {
  const parsed = resolvePackageCommitQuantity(item);
  return Number.isFinite(parsed) ? parsed : 0;
}

function descriptionFor(item: PartRequestItem): string {
  return String(item.description ?? "").trim();
}

async function ensureWorkOrderPart(
  supabase: SupabaseClient<DB>,
  itemId: string,
): Promise<string> {
  const { data, error } = await supabase.rpc("parts_ensure_work_order_part" as never, {
    p_request_item_id: itemId,
  } as never);
  if (error) throw new Error(error.message);
  if (!isUuid(data)) throw new Error("Canonical parts package helper did not return a work-order part id.");
  return data;
}

export async function POST(_req: Request, ctx: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await ctx.params;
  if (!isUuid(requestId)) return NextResponse.json({ ok: false, error: "Invalid requestId." }, { status: 400 });

  const access = await requireShopScopedApiAccess({ requiredCapability: "canManageWorkOrders" });
  if (!access.ok) return access.response;

  const supabase = access.supabase;
  const shopId = access.profile.shop_id;

  const { data: request, error: requestError } = await supabase
    .from("part_requests")
    .select("id, shop_id, work_order_id, status")
    .eq("id", requestId)
    .eq("shop_id", shopId)
    .maybeSingle();

  if (requestError) return NextResponse.json({ ok: false, error: requestError.message }, { status: 500 });
  if (!request) return NextResponse.json({ ok: false, error: "Parts request not found for this shop." }, { status: 404 });
  if (!request.work_order_id) {
    return NextResponse.json({ ok: false, error: "Parts request is not linked to a work order." }, { status: 409 });
  }

  const { data: workOrder, error: workOrderError } = await supabase
    .from("work_orders")
    .select("id, shop_id")
    .eq("id", request.work_order_id)
    .eq("shop_id", shopId)
    .maybeSingle();
  if (workOrderError) return NextResponse.json({ ok: false, error: workOrderError.message }, { status: 500 });
  if (!workOrder) return NextResponse.json({ ok: false, error: "Related work order is not available for this shop." }, { status: 403 });

  const { data: itemsData, error: itemsError } = await supabase
    .from("part_request_items")
    .select("*")
    .eq("request_id", requestId)
    .eq("shop_id", shopId)
    .order("created_at", { ascending: true });
  if (itemsError) return NextResponse.json({ ok: false, error: itemsError.message }, { status: 500 });

  const items = (itemsData ?? []) as PartRequestItem[];
  const itemIds = items.map((item) => item.id);
  const existingByItemId = new Map<string, string>();
  if (itemIds.length > 0) {
    const { data: existingRows, error: existingError } = await supabase
      .from("work_order_parts")
      .select("id, source_parts_request_item_id")
      .in("source_parts_request_item_id", itemIds)
      .eq("shop_id", shopId)
      .eq("is_active", true);
    if (existingError) return NextResponse.json({ ok: false, error: existingError.message }, { status: 500 });
    for (const row of (existingRows ?? []) as Array<{ id: string; source_parts_request_item_id: string | null }>) {
      if (row.source_parts_request_item_id) existingByItemId.set(row.source_parts_request_item_id, row.id);
    }
  }

  const results: ItemResult[] = [];
  for (const item of items) {
    const itemId = String(item.id);
    const existingId = existingByItemId.get(itemId);
    if (existingId) {
      results.push({ itemId, status: "already_committed", workOrderPartId: existingId });
      continue;
    }

    if (!item.part_id) {
      results.push({ itemId, status: "skipped", reason: "Select an inventory part before saving this item to the work order." });
      continue;
    }
    if (!item.work_order_line_id) {
      results.push({ itemId, status: "skipped", reason: "Item is not linked to a work-order repair line." });
      continue;
    }
    if (item.work_order_id && item.work_order_id !== request.work_order_id) {
      results.push({ itemId, status: "error", error: "Item work order does not match the parent request." });
      continue;
    }
    if (positiveQuantity(item) <= 0) {
      results.push({ itemId, status: "skipped", reason: "Quantity must be greater than zero." });
      continue;
    }
    if (!descriptionFor(item)) {
      results.push({ itemId, status: "skipped", reason: "Description is required." });
      continue;
    }

    const { data: line, error: lineError } = await supabase
      .from("work_order_lines")
      .select("id, work_order_id, shop_id")
      .eq("id", item.work_order_line_id)
      .eq("work_order_id", request.work_order_id)
      .eq("shop_id", shopId)
      .maybeSingle();
    if (lineError) {
      results.push({ itemId, status: "error", error: lineError.message });
      continue;
    }
    if (!line) {
      results.push({ itemId, status: "error", error: "Work-order line is not available for this shop or request." });
      continue;
    }

    try {
      const workOrderPartId = await ensureWorkOrderPart(supabase, itemId);
      results.push({ itemId, status: "committed", workOrderPartId });
    } catch (error) {
      results.push({ itemId, status: "error", error: error instanceof Error ? error.message : "Could not save item to work order." });
    }
  }

  const committed = results.filter((result): result is Extract<ItemResult, { workOrderPartId: string }> => result.status === "committed" || result.status === "already_committed");
  const errors = results.filter((result) => result.status === "error");
  const skipped = results.filter((result) => result.status === "skipped");
  const ok = errors.length === 0 && skipped.length === 0;

  return NextResponse.json({
    ok,
    requestId,
    committedCount: committed.length,
    skippedCount: skipped.length,
    results,
    workOrderPartIds: committed.map((result) => result.workOrderPartId),
    errorsRequiringReview: [...errors, ...skipped],
  }, { status: errors.length > 0 ? 409 : 200 });
}
