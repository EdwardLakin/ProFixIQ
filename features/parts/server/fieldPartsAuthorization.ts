import "server-only";

import {
  canFieldActorAccessWorkOrder,
  requireCanonicalShopOrFieldApiAccess,
} from "@/features/mobile/service/server/access";

export type CanonicalPartsApiAccess = Extract<
  Awaited<ReturnType<typeof requireCanonicalShopOrFieldApiAccess>>,
  { ok: true }
>;

export function requireCanonicalPartsApiAccess() {
  return requireCanonicalShopOrFieldApiAccess({
    requiredCapability: "canManageParts",
  });
}

async function canAccessWorkOrders(
  access: CanonicalPartsApiAccess,
  workOrderIds: readonly string[],
): Promise<boolean> {
  if (access.productScope === "shop") return true;
  if (workOrderIds.length === 0) return false;

  for (const workOrderId of new Set(workOrderIds)) {
    if (!(await canFieldActorAccessWorkOrder(access, workOrderId))) {
      return false;
    }
  }
  return true;
}

export async function canAccessPartsRequestItem(
  access: CanonicalPartsApiAccess,
  itemId: string,
): Promise<boolean> {
  if (access.productScope === "shop") return true;

  const { data: item, error } = await access.supabase
    .from("part_request_items")
    .select("work_order_id")
    .eq("id", itemId)
    .eq("shop_id", access.profile.shop_id)
    .maybeSingle<{ work_order_id: string | null }>();
  if (error) throw new Error(error.message);

  return Boolean(
    item?.work_order_id &&
      (await canAccessWorkOrders(access, [item.work_order_id])),
  );
}

export async function canAccessPartsPurchaseOrder(
  access: CanonicalPartsApiAccess,
  purchaseOrderId: string,
): Promise<boolean> {
  if (access.productScope === "shop") return true;

  const { data: purchaseOrder, error: purchaseOrderError } =
    await access.supabase
      .from("purchase_orders")
      .select("id")
      .eq("id", purchaseOrderId)
      .eq("shop_id", access.profile.shop_id)
      .maybeSingle<{ id: string }>();
  if (purchaseOrderError) throw new Error(purchaseOrderError.message);
  if (!purchaseOrder) return false;

  const { data: lines, error: lineError } = await access.supabase
    .from("purchase_order_lines")
    .select("part_request_item_id")
    .eq("po_id", purchaseOrderId);
  if (lineError) throw new Error(lineError.message);

  const itemIds = (lines ?? []).map((line) => line.part_request_item_id);
  if (itemIds.length === 0 || itemIds.some((itemId) => !itemId)) return false;

  const { data: items, error: itemError } = await access.supabase
    .from("part_request_items")
    .select("id,work_order_id")
    .eq("shop_id", access.profile.shop_id)
    .in("id", itemIds as string[]);
  if (itemError) throw new Error(itemError.message);
  if (
    !items ||
    items.length !== new Set(itemIds).size ||
    items.some((item) => !item.work_order_id)
  ) {
    return false;
  }

  return canAccessWorkOrders(
    access,
    items.map((item) => item.work_order_id as string),
  );
}
