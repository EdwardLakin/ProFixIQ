import { NextResponse } from "next/server";

import { listFieldOperatorAssignedWorkOrderIds } from "@/features/mobile/service/server/access";
import { requireCanonicalPartsApiAccess } from "@/features/parts/server/fieldPartsAuthorization";

const ORDERABLE_REQUEST_STATUSES = [
  "approved",
  "partially_ordered",
  "partially_consumed",
  "partially_returned",
] as const;
const ACTIVE_PURCHASE_ORDER_STATUSES = [
  "draft",
  "open",
  "ordered",
  "partially_ordered",
  "sent",
  "receiving",
  "partially_received",
] as const;
const QUERY_PAGE_SIZE = 200;
const QUERY_ID_BATCH_SIZE = 100;

type PageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

async function loadAllPages<T>(
  readPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += QUERY_PAGE_SIZE) {
    const result = await readPage(offset, offset + QUERY_PAGE_SIZE - 1);
    if (result.error) throw new Error(result.error.message);
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < QUERY_PAGE_SIZE) return rows;
  }
}

async function loadForIdBatches<T>(
  ids: readonly string[],
  readPage: (
    ids: string[],
    from: number,
    to: number,
  ) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; start < ids.length; start += QUERY_ID_BATCH_SIZE) {
    const batch = ids.slice(start, start + QUERY_ID_BATCH_SIZE);
    rows.push(...(await loadAllPages((from, to) => readPage(batch, from, to))));
  }
  return rows;
}

export async function GET() {
  const access = await requireCanonicalPartsApiAccess();
  if (!access.ok) return access.response;

  try {
    const fieldWorkOrderIds =
      access.productScope === "field"
        ? await listFieldOperatorAssignedWorkOrderIds(access)
        : null;

    const requests =
      fieldWorkOrderIds?.length === 0
        ? []
        : await loadAllPages((from, to) => {
            let query = access.supabase
              .from("part_requests")
              .select("id,work_order_id,status")
              .eq("shop_id", access.profile.shop_id)
              .in("status", [...ORDERABLE_REQUEST_STATUSES]);
            if (fieldWorkOrderIds) {
              query = query.in("work_order_id", fieldWorkOrderIds);
            }
            return query
              .order("created_at", { ascending: false })
              .order("id", { ascending: false })
              .range(from, to);
          });

    const [purchaseOrders, supplierResult, locationResult] = await Promise.all([
      fieldWorkOrderIds?.length === 0
        ? Promise.resolve([])
        : loadAllPages((from, to) =>
            access.supabase
              .from("purchase_orders")
              .select(
                "id,po_number,supplier_id,status,created_at,ordered_at,expected_at,work_order_id,supplier_quote_request_id,total",
              )
              .eq("shop_id", access.profile.shop_id)
              .in("status", [...ACTIVE_PURCHASE_ORDER_STATUSES])
              .order("created_at", { ascending: false })
              .order("id", { ascending: false })
              .range(from, to),
          ),
      access.supabase
        .from("suppliers")
        .select("id,name,email,phone,is_active")
        .eq("shop_id", access.profile.shop_id)
        .order("name", { ascending: true })
        .limit(1000),
      access.supabase
        .from("stock_locations")
        .select("id,code,name")
        .eq("shop_id", access.profile.shop_id)
        .order("code", { ascending: true }),
    ]);
    if (supplierResult.error || locationResult.error) {
      throw new Error(
        supplierResult.error?.message || locationResult.error?.message,
      );
    }

    const orderingItems = await loadForIdBatches(
      requests.map((request) => request.id),
      (requestIds, from, to) =>
        access.supabase
          .from("part_request_items")
          .select(
            "id,request_id,work_order_id,work_order_line_id,part_id,description,status,qty,qty_requested,qty_approved,qty_ordered,qty_received,unit_cost,location_id,vendor_id,updated_at",
          )
          .eq("shop_id", access.profile.shop_id)
          .in("request_id", requestIds)
          .order("updated_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to),
    );

    const lines = await loadForIdBatches(
      purchaseOrders.map((purchaseOrder) => purchaseOrder.id),
      (purchaseOrderIds, from, to) =>
        access.supabase
          .from("purchase_order_lines")
          .select(
            "id,po_id,part_request_item_id,part_id,description,sku,qty,cancelled_qty,received_qty,unit_cost,location_id,created_at",
          )
          .in("po_id", purchaseOrderIds)
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
    );

    const purchaseOrderItems = await loadForIdBatches(
      Array.from(
        new Set(
          lines
            .map((line) => line.part_request_item_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ),
      (itemIds, from, to) =>
        access.supabase
          .from("part_request_items")
          .select(
            "id,request_id,work_order_id,work_order_line_id,part_id,description,status,qty,qty_requested,qty_approved,qty_ordered,qty_received,unit_cost,location_id,vendor_id,updated_at",
          )
          .eq("shop_id", access.profile.shop_id)
          .in("id", itemIds)
          .order("updated_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to),
    );
    const items = [
      ...new Map(
        [...orderingItems, ...purchaseOrderItems].map((item) => [
          item.id,
          item,
        ]),
      ).values(),
    ];
    const fieldWorkOrderIdSet = fieldWorkOrderIds
      ? new Set(fieldWorkOrderIds)
      : null;
    const allowedItemIds = new Set(
      items
        .filter(
          (item) =>
            !fieldWorkOrderIdSet ||
            (item.work_order_id &&
              fieldWorkOrderIdSet.has(item.work_order_id)),
        )
        .map((item) => item.id),
    );
    const visiblePurchaseOrders = fieldWorkOrderIds
      ? purchaseOrders.filter((purchaseOrder) => {
          const purchaseOrderLines = lines.filter(
            (line) => line.po_id === purchaseOrder.id,
          );
          return (
            (!purchaseOrder.work_order_id ||
              fieldWorkOrderIdSet?.has(purchaseOrder.work_order_id)) &&
            purchaseOrderLines.length > 0 &&
            purchaseOrderLines.every(
              (line) =>
                line.part_request_item_id &&
                allowedItemIds.has(line.part_request_item_id),
            )
          );
        })
      : purchaseOrders;
    const visiblePurchaseOrderIds = new Set(
      visiblePurchaseOrders.map((purchaseOrder) => purchaseOrder.id),
    );
    const visibleLines = lines.filter((line) =>
      visiblePurchaseOrderIds.has(line.po_id),
    );

    const workOrderIds = Array.from(
      new Set(
        [
          ...requests.map((request) => request.work_order_id),
          ...items.map((item) => item.work_order_id),
          ...visiblePurchaseOrders.map(
            (purchaseOrder) => purchaseOrder.work_order_id,
          ),
        ].filter((id): id is string => Boolean(id)),
      ),
    );
    const workOrders = await loadForIdBatches(
      workOrderIds,
      (ids, from, to) =>
        access.supabase
          .from("work_orders")
          .select("id,custom_id")
          .eq("shop_id", access.profile.shop_id)
          .in("id", ids)
          .order("id", { ascending: true })
          .range(from, to),
    );

    return NextResponse.json({
      ok: true,
      snapshot: {
        requests,
        items,
        suppliers: supplierResult.data ?? [],
        locations: locationResult.data ?? [],
        purchaseOrders: visiblePurchaseOrders,
        lines: visibleLines,
        workOrders,
      },
    });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Purchase orders could not be loaded." },
      { status: 500 },
    );
  }
}
