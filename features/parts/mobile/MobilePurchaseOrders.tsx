"use client";

import {
  ChevronDown,
  PackageCheck,
  PackagePlus,
  RefreshCw,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { purchaseOrderIdentity } from "@/features/parts/lib/purchaseOrderIdentity";
import { isOpenPartsObligation } from "@/features/parts/lib/open-parts-obligations";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import {
  purchaseOrderCanReceive,
  purchaseOrderLineRemaining,
  requestRemainingToOrder,
  requestTargetQuantity,
} from "./mobilePurchaseOrderQuantities";

type View = "needs-ordering" | "purchase-orders";

type PartRequest = {
  id: string;
  work_order_id: string | null;
  status: string | null;
};

type PartRequestItem = {
  id: string;
  request_id: string;
  work_order_id: string | null;
  work_order_line_id: string | null;
  part_id: string | null;
  description: string;
  status: string | null;
  qty: number | null;
  qty_requested: number | null;
  qty_approved: number | null;
  qty_ordered: number | null;
  qty_received: number | null;
  unit_cost: number | null;
  location_id: string | null;
  vendor_id: string | null;
  updated_at: string | null;
};

type Supplier = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
};

type StockLocation = {
  id: string;
  code: string;
  name: string;
};

type PurchaseOrder = {
  id: string;
  po_number: string | null;
  supplier_id: string;
  status: string;
  created_at: string;
  ordered_at: string | null;
  expected_at: string | null;
  work_order_id: string | null;
  supplier_quote_request_id: string | null;
  total: number | null;
};

type PurchaseOrderLine = {
  id: string;
  po_id: string;
  part_request_item_id: string | null;
  part_id: string | null;
  description: string | null;
  sku: string | null;
  qty: number;
  cancelled_qty: number;
  received_qty: number;
  unit_cost: number | null;
  location_id: string | null;
  created_at: string;
};

type WorkOrder = {
  id: string;
  custom_id: string | null;
};

type OrderDraft = {
  item: PartRequestItem;
  supplierId: string;
  newSupplierName: string;
  locationId: string;
  qty: number;
  unitCost: number | "";
  notes: string;
};

type ReceiveDraft = {
  purchaseOrder: PurchaseOrder;
  line: PurchaseOrderLine;
  locationId: string;
  qty: number;
};

type JsonResult = {
  ok?: boolean;
  error?: string;
  vendorId?: string;
  vendorIsActive?: boolean;
  vendor?: Supplier;
  result?: Record<string, unknown>;
};

const ORDERABLE_REQUEST_STATUSES = [
  "approved",
  "partially_ordered",
  "partially_consumed",
  "partially_returned",
] as const;

const CLOSED_PO_STATUSES = new Set(["received", "cancelled", "canceled"]);
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

const actionClass =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] px-3 py-2 text-sm font-semibold text-[color:var(--theme-text-primary)] transition hover:border-[color:var(--accent-copper)] disabled:cursor-not-allowed disabled:opacity-50";
const primaryActionClass = `${actionClass} border-[color:var(--accent-copper)] bg-[color:var(--accent-copper)] text-white`;
const fieldClass =
  "mt-1 min-h-11 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-3 text-[color:var(--theme-text-primary)] outline-none focus:border-[color:var(--accent-copper)]";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numeric(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatQuantity(value: number): string {
  return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2);
}

function formatMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return "Not set";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(Number(value));
}

function formatDate(value: string | null): string {
  if (!value) return "No date";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "No date"
    : new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
      }).format(date);
}

function statusTone(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "received") {
    return "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200";
  }
  if (normalized === "ordered" || normalized === "receiving") {
    return "border-sky-500/35 bg-sky-500/10 text-sky-700 dark:text-sky-200";
  }
  if (normalized === "cancelled" || normalized === "canceled") {
    return "border-rose-500/35 bg-rose-500/10 text-rose-700 dark:text-rose-200";
  }
  return "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] text-[color:var(--theme-text-secondary)]";
}

function operationId(): string {
  return globalThis.crypto.randomUUID();
}

async function readJson(response: Response): Promise<JsonResult | null> {
  return (await response.json().catch(() => null)) as JsonResult | null;
}

export default function MobilePurchaseOrders({
  shopId,
}: {
  shopId: string;
}): JSX.Element {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [view, setView] = useState<View>("needs-ordering");
  const [requests, setRequests] = useState<PartRequest[]>([]);
  const [items, setItems] = useState<PartRequestItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [lines, setLines] = useState<PurchaseOrderLine[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orderDraft, setOrderDraft] = useState<OrderDraft | null>(null);
  const [receiveDraft, setReceiveDraft] = useState<ReceiveDraft | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [placingPoId, setPlacingPoId] = useState<string | null>(null);
  const orderOperationRef = useRef<{ signature: string; key: string } | null>(
    null,
  );
  const receiveOperationRef = useRef<{
    signature: string;
    key: string;
  } | null>(null);
  const placeOperationKeys = useRef(new Map<string, string>());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const requestPromise = (async (): Promise<PartRequest[]> => {
        const rows: PartRequest[] = [];
        for (let offset = 0; ; offset += QUERY_PAGE_SIZE) {
          const result = await supabase
            .from("part_requests")
            .select("id,work_order_id,status")
            .eq("shop_id", shopId)
            .in("status", [...ORDERABLE_REQUEST_STATUSES])
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .range(offset, offset + QUERY_PAGE_SIZE - 1);
          if (result.error) throw result.error;
          const page = (result.data ?? []) as PartRequest[];
          rows.push(...page);
          if (page.length < QUERY_PAGE_SIZE) return rows;
        }
      })();
      const purchaseOrderPromise = (async (): Promise<PurchaseOrder[]> => {
        const rows: PurchaseOrder[] = [];
        for (let offset = 0; ; offset += QUERY_PAGE_SIZE) {
          const result = await supabase
            .from("purchase_orders")
            .select(
              "id,po_number,supplier_id,status,created_at,ordered_at,expected_at,work_order_id,supplier_quote_request_id,total",
            )
            .eq("shop_id", shopId)
            .in("status", [...ACTIVE_PURCHASE_ORDER_STATUSES])
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .range(offset, offset + QUERY_PAGE_SIZE - 1);
          if (result.error) throw result.error;
          const page = (result.data ?? []) as PurchaseOrder[];
          rows.push(...page);
          if (page.length < QUERY_PAGE_SIZE) return rows;
        }
      })();

      const [nextRequests, supplierResult, locationResult, nextPurchaseOrders] =
        await Promise.all([
          requestPromise,
          supabase
            .from("suppliers")
            .select("id,name,email,phone,is_active")
            .eq("shop_id", shopId)
            .order("name", { ascending: true })
            .limit(1000),
          supabase
            .from("stock_locations")
            .select("id,code,name")
            .eq("shop_id", shopId)
            .order("code", { ascending: true }),
          purchaseOrderPromise,
        ]);

      const firstError = supplierResult.error || locationResult.error;
      if (firstError) throw firstError;

      const requestIds = nextRequests.map((request) => request.id);
      const poIds = nextPurchaseOrders.map((purchaseOrder) => purchaseOrder.id);

      const nextItems: PartRequestItem[] = [];
      for (
        let start = 0;
        start < requestIds.length;
        start += QUERY_ID_BATCH_SIZE
      ) {
        const requestIdBatch = requestIds.slice(
          start,
          start + QUERY_ID_BATCH_SIZE,
        );
        for (let offset = 0; ; offset += QUERY_PAGE_SIZE) {
          const itemResult = await supabase
            .from("part_request_items")
            .select(
              "id,request_id,work_order_id,work_order_line_id,part_id,description,status,qty,qty_requested,qty_approved,qty_ordered,qty_received,unit_cost,location_id,vendor_id,updated_at",
            )
            .eq("shop_id", shopId)
            .in("request_id", requestIdBatch)
            .order("updated_at", { ascending: false })
            .order("id", { ascending: false })
            .range(offset, offset + QUERY_PAGE_SIZE - 1);
          if (itemResult.error) throw itemResult.error;
          const page = (itemResult.data ?? []) as PartRequestItem[];
          nextItems.push(...page);
          if (page.length < QUERY_PAGE_SIZE) break;
        }
      }

      const nextLines: PurchaseOrderLine[] = [];
      for (let start = 0; start < poIds.length; start += QUERY_ID_BATCH_SIZE) {
        const poIdBatch = poIds.slice(start, start + QUERY_ID_BATCH_SIZE);
        for (let offset = 0; ; offset += QUERY_PAGE_SIZE) {
          const lineResult = await supabase
            .from("purchase_order_lines")
            .select(
              "id,po_id,part_request_item_id,part_id,description,sku,qty,cancelled_qty,received_qty,unit_cost,location_id,created_at",
            )
            .in("po_id", poIdBatch)
            .order("created_at", { ascending: true })
            .order("id", { ascending: true })
            .range(offset, offset + QUERY_PAGE_SIZE - 1);
          if (lineResult.error) throw lineResult.error;
          const page = (lineResult.data ?? []) as PurchaseOrderLine[];
          nextLines.push(...page);
          if (page.length < QUERY_PAGE_SIZE) break;
        }
      }

      const workOrderIds = Array.from(
        new Set(
          [
            ...nextRequests.map((request) => request.work_order_id),
            ...nextItems.map((item) => item.work_order_id),
            ...nextPurchaseOrders.map(
              (purchaseOrder) => purchaseOrder.work_order_id,
            ),
          ].filter((id): id is string => Boolean(id)),
        ),
      );
      const nextWorkOrders: WorkOrder[] = [];
      for (
        let start = 0;
        start < workOrderIds.length;
        start += QUERY_ID_BATCH_SIZE
      ) {
        const workOrderIdBatch = workOrderIds.slice(
          start,
          start + QUERY_ID_BATCH_SIZE,
        );
        const workOrderResult = await supabase
          .from("work_orders")
          .select("id,custom_id")
          .eq("shop_id", shopId)
          .in("id", workOrderIdBatch);
        if (workOrderResult.error) throw workOrderResult.error;
        nextWorkOrders.push(...((workOrderResult.data ?? []) as WorkOrder[]));
      }

      setRequests(nextRequests);
      setItems(nextItems);
      setSuppliers((supplierResult.data ?? []) as Supplier[]);
      setLocations((locationResult.data ?? []) as StockLocation[]);
      setPurchaseOrders(nextPurchaseOrders);
      setLines(nextLines);
      setWorkOrders(nextWorkOrders);
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "Unable to load purchase orders.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [shopId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  const requestById = useMemo(
    () => new Map(requests.map((request) => [request.id, request])),
    [requests],
  );
  const itemById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );
  const supplierById = useMemo(
    () => new Map(suppliers.map((supplier) => [supplier.id, supplier])),
    [suppliers],
  );
  const activeSuppliers = useMemo(
    () => suppliers.filter((supplier) => supplier.is_active),
    [suppliers],
  );
  const workOrderById = useMemo(
    () => new Map(workOrders.map((workOrder) => [workOrder.id, workOrder])),
    [workOrders],
  );
  const linesByPoId = useMemo(() => {
    const result = new Map<string, PurchaseOrderLine[]>();
    for (const line of lines) {
      const current = result.get(line.po_id) ?? [];
      current.push(line);
      result.set(line.po_id, current);
    }
    return result;
  }, [lines]);

  const needsOrdering = useMemo(
    () =>
      items.filter(
        (item) => {
          const request = requestById.get(item.request_id);
          return (
            Boolean(request) &&
            isOpenPartsObligation(request?.status, item) &&
            requestRemainingToOrder(item) > 0
          );
        },
      ),
    [items, requestById],
  );
  const activePurchaseOrders = useMemo(
    () =>
      purchaseOrders.filter(
        (purchaseOrder) =>
          !CLOSED_PO_STATUSES.has(clean(purchaseOrder.status).toLowerCase()),
      ),
    [purchaseOrders],
  );
  const receivingLineCount = useMemo(() => {
    const receivablePoIds = new Set(
      activePurchaseOrders
        .filter((purchaseOrder) =>
          purchaseOrderCanReceive(purchaseOrder.status),
        )
        .map((purchaseOrder) => purchaseOrder.id),
    );
    return lines.filter(
      (line) =>
        receivablePoIds.has(line.po_id) && purchaseOrderLineRemaining(line) > 0,
    ).length;
  }, [activePurchaseOrders, lines]);
  const defaultLocationId = useMemo(() => {
    const main = locations.find(
      (location) => clean(location.code).toUpperCase() === "MAIN",
    );
    return main?.id ?? locations[0]?.id ?? "";
  }, [locations]);

  const workOrderLabel = useCallback(
    (workOrderId: string | null | undefined): string => {
      if (!workOrderId) return "Stock purchase";
      const workOrder = workOrderById.get(workOrderId);
      return clean(workOrder?.custom_id) || `WO ${workOrderId.slice(0, 8)}`;
    },
    [workOrderById],
  );

  const openOrder = (item: PartRequestItem) => {
    const preferredSupplier = item.vendor_id
      ? suppliers.find((supplier) => supplier.id === item.vendor_id)
      : null;
    const preferredLocation = locations.some(
      (location) => location.id === item.location_id,
    )
      ? (item.location_id ?? "")
      : defaultLocationId;
    setOrderDraft({
      item,
      supplierId: preferredSupplier?.id ?? activeSuppliers[0]?.id ?? "",
      newSupplierName: "",
      locationId: preferredLocation,
      qty: requestRemainingToOrder(item),
      unitCost: item.unit_cost == null ? "" : numeric(item.unit_cost),
      notes: "",
    });
    orderOperationRef.current = null;
  };

  const placePurchaseOrder = async (purchaseOrder: PurchaseOrder) => {
    if (placingPoId) return;
    const supplier = supplierById.get(purchaseOrder.supplier_id);
    const contactChannel = purchaseOrder.supplier_quote_request_id
      ? clean(supplier?.email)
        ? "email"
        : clean(supplier?.phone)
          ? "phone"
          : null
      : null;
    if (purchaseOrder.supplier_quote_request_id && !contactChannel) {
      toast.error(
        "Add an email address or phone number for this supplier before placing the quoted PO.",
      );
      return;
    }
    const key =
      placeOperationKeys.current.get(purchaseOrder.id) ?? operationId();
    placeOperationKeys.current.set(purchaseOrder.id, key);
    setPlacingPoId(purchaseOrder.id);

    try {
      const response = await fetch(
        `/api/parts/purchase-orders/${encodeURIComponent(
          purchaseOrder.id,
        )}/place`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": key,
          },
          body: JSON.stringify({
            idempotencyKey: key,
            contactChannel,
          }),
        },
      );
      const payload = await readJson(response);
      if (!response.ok || payload?.ok === false || payload?.error) {
        throw new Error(
          payload?.error || "Unable to place the purchase order.",
        );
      }

      placeOperationKeys.current.delete(purchaseOrder.id);
      toast.success("Purchase order marked as placed.");
      await load();
    } catch (placeError) {
      toast.error(
        placeError instanceof Error
          ? placeError.message
          : "Unable to place the purchase order.",
      );
    } finally {
      setPlacingPoId(null);
    }
  };

  const ensureSupplier = async (draft: OrderDraft): Promise<string> => {
    if (draft.supplierId) return draft.supplierId;
    const name = clean(draft.newSupplierName);
    if (!name)
      throw new Error("Select a supplier or enter a new supplier name.");

    const response = await fetch("/api/parts/vendors", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, isActive: true }),
    });
    const payload = await readJson(response);
    const supplierId = clean(payload?.vendor?.id || payload?.vendorId);
    if ((!response.ok && response.status !== 409) || !supplierId) {
      throw new Error(payload?.error || "Unable to create the supplier.");
    }
    if (response.status === 409) {
      const duplicate = suppliers.find(
        (supplier) => supplier.id === supplierId,
      );
      const duplicateIsActive =
        payload?.vendorIsActive ?? duplicate?.is_active ?? false;
      if (!duplicateIsActive) {
        throw new Error(
          "A supplier with this name is inactive. Reactivate it before creating a purchase order.",
        );
      }
    }
    if (payload?.vendor) {
      setSuppliers((current) =>
        [
          ...current.filter((supplier) => supplier.id !== supplierId),
          payload.vendor!,
        ].sort((left, right) => left.name.localeCompare(right.name)),
      );
    }
    return supplierId;
  };

  const submitOrder = async () => {
    if (!orderDraft || submitting) return;
    const remaining = requestRemainingToOrder(orderDraft.item);
    if (!Number.isFinite(orderDraft.qty) || orderDraft.qty <= 0) {
      toast.error("Order quantity must be greater than zero.");
      return;
    }
    if (Math.round(orderDraft.qty * 100) / 100 !== orderDraft.qty) {
      toast.error("Order quantity supports at most two decimal places.");
      return;
    }
    if (orderDraft.qty > remaining) {
      toast.error(
        `Only ${formatQuantity(remaining)} remains approved to order.`,
      );
      return;
    }
    if (!orderDraft.locationId) {
      toast.error("Select the receiving location.");
      return;
    }
    if (orderDraft.unitCost !== "" && orderDraft.unitCost < 0) {
      toast.error("Acquisition cost cannot be negative.");
      return;
    }
    if (!orderDraft.item.part_id && orderDraft.unitCost === "") {
      toast.error(
        "Enter the supplier acquisition cost for this free-text part.",
      );
      return;
    }

    setSubmitting(true);
    try {
      const supplierId = await ensureSupplier(orderDraft);
      if (
        orderDraft.item.vendor_id &&
        supplierId !== orderDraft.item.vendor_id
      ) {
        throw new Error(
          "This approved request is assigned to a different supplier.",
        );
      }
      const signature = JSON.stringify({
        itemId: orderDraft.item.id,
        supplierId,
        locationId: orderDraft.locationId,
        qty: orderDraft.qty,
        unitCost: orderDraft.unitCost === "" ? null : orderDraft.unitCost,
        notes: clean(orderDraft.notes) || null,
      });
      const existing = orderOperationRef.current;
      const key =
        existing?.signature === signature ? existing.key : operationId();
      orderOperationRef.current = { signature, key };

      const response = await fetch(
        `/api/parts/requests/items/${encodeURIComponent(
          orderDraft.item.id,
        )}/po-line`,
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": key,
          },
          body: JSON.stringify({
            supplierId,
            locationId: orderDraft.locationId,
            qty: orderDraft.qty,
            unitCost: orderDraft.unitCost === "" ? null : orderDraft.unitCost,
            notes: clean(orderDraft.notes) || null,
            idempotencyKey: key,
          }),
        },
      );
      const payload = await readJson(response);
      if (!response.ok || payload?.ok === false || payload?.error) {
        throw new Error(
          payload?.error || "Unable to add this part to a purchase order.",
        );
      }

      orderOperationRef.current = null;
      setOrderDraft(null);
      toast.success(
        payload?.result?.po_created
          ? "Purchase order created."
          : "Part added to the supplier purchase order.",
      );
      await load();
      setView("purchase-orders");
    } catch (submitError) {
      toast.error(
        submitError instanceof Error
          ? submitError.message
          : "Unable to create the purchase order.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const openReceive = (
    purchaseOrder: PurchaseOrder,
    line: PurchaseOrderLine,
  ) => {
    const preferredLocation = locations.some(
      (location) => location.id === line.location_id,
    )
      ? (line.location_id ?? "")
      : defaultLocationId;
    setReceiveDraft({
      purchaseOrder,
      line,
      locationId: preferredLocation,
      qty: purchaseOrderLineRemaining(line),
    });
    receiveOperationRef.current = null;
  };

  const submitReceive = async () => {
    if (!receiveDraft || submitting) return;
    const remaining = purchaseOrderLineRemaining(receiveDraft.line);
    if (!Number.isFinite(receiveDraft.qty) || receiveDraft.qty <= 0) {
      toast.error("Receipt quantity must be greater than zero.");
      return;
    }
    if (Math.round(receiveDraft.qty * 100) / 100 !== receiveDraft.qty) {
      toast.error("Receipt quantity supports at most two decimal places.");
      return;
    }
    if (receiveDraft.qty > remaining) {
      toast.error(`Only ${formatQuantity(remaining)} remains on this line.`);
      return;
    }
    const needsLocation = Boolean(receiveDraft.line.part_id);
    if (needsLocation && !receiveDraft.locationId) {
      toast.error("Select the receiving location.");
      return;
    }

    const signature = JSON.stringify({
      poId: receiveDraft.purchaseOrder.id,
      lineId: receiveDraft.line.id,
      requestItemId: receiveDraft.line.part_request_item_id,
      partId: receiveDraft.line.part_id,
      locationId: receiveDraft.locationId,
      qty: receiveDraft.qty,
      alreadyReceived: receiveDraft.line.received_qty,
    });
    const existing = receiveOperationRef.current;
    const key =
      existing?.signature === signature ? existing.key : operationId();
    receiveOperationRef.current = { signature, key };

    setSubmitting(true);
    try {
      let response: Response;
      if (
        receiveDraft.line.part_request_item_id &&
        receiveDraft.line.part_id
      ) {
        response = await fetch(
          `/api/parts/requests/items/${encodeURIComponent(
            receiveDraft.line.part_request_item_id,
          )}/receive`,
          {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": key,
            },
            body: JSON.stringify({
              location_id: receiveDraft.locationId,
              qty: receiveDraft.qty,
              po_id: receiveDraft.purchaseOrder.id,
              idempotencyKey: key,
            }),
          },
        );
      } else if (receiveDraft.line.part_id) {
        response = await fetch("/api/receive-scan", {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": key,
          },
          body: JSON.stringify({
            part_id: receiveDraft.line.part_id,
            location_id: receiveDraft.locationId,
            qty: receiveDraft.qty,
            po_id: receiveDraft.purchaseOrder.id,
            operation_id: key,
          }),
        });
      } else {
        response = await fetch(
          `/api/parts/purchase-orders/${encodeURIComponent(
            receiveDraft.purchaseOrder.id,
          )}/lines/${encodeURIComponent(
            receiveDraft.line.id,
          )}/receive-free-text`,
          {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": key,
            },
            body: JSON.stringify({
              qty: receiveDraft.qty,
              idempotencyKey: key,
            }),
          },
        );
      }

      const payload = await readJson(response);
      if (!response.ok || payload?.ok === false || payload?.error) {
        throw new Error(
          payload?.error || "Unable to receive this purchase-order line.",
        );
      }

      receiveOperationRef.current = null;
      setReceiveDraft(null);
      toast.success("Purchase-order receipt recorded.");
      window.dispatchEvent(new Event("parts:received"));
      await load();
    } catch (receiveError) {
      toast.error(
        receiveError instanceof Error
          ? receiveError.message
          : "Unable to receive this purchase-order line.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-3 gap-2">
        {[
          ["Needs ordering", needsOrdering.length],
          ["Open POs", activePurchaseOrders.length],
          ["Lines to receive", receivingLineCount],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-3"
          >
            <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]">
              {label}
            </span>
            <strong className="mt-1 block text-2xl text-[color:var(--theme-text-primary)]">
              {loading ? "..." : value}
            </strong>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setView("needs-ordering")}
          data-active={view === "needs-ordering" ? "true" : "false"}
          className="min-h-14 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] px-3 text-left text-sm font-semibold text-[color:var(--theme-text-primary)] data-[active=true]:border-[color:var(--accent-copper)]"
        >
          Author POs
        </button>
        <button
          type="button"
          onClick={() => setView("purchase-orders")}
          data-active={view === "purchase-orders" ? "true" : "false"}
          className="min-h-14 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] px-3 text-left text-sm font-semibold text-[color:var(--theme-text-primary)] data-[active=true]:border-[color:var(--accent-copper)]"
        >
          Receive POs
        </button>
      </section>

      {error ? (
        <div className="rounded-2xl border border-red-500/35 bg-red-500/10 p-4 text-sm text-red-700 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <section className="rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4 shadow-[var(--theme-shadow-medium)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--accent-copper)]">
              {view === "needs-ordering"
                ? "Approved demand"
                : "Supplier orders"}
            </div>
            <h2 className="mt-1 text-xl font-semibold text-[color:var(--theme-text-primary)]">
              {view === "needs-ordering"
                ? "Create or extend a draft PO"
                : "Receive against the exact PO"}
            </h2>
          </div>
          <button
            type="button"
            className={actionClass}
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw
              aria-hidden
              className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </div>

        {view === "needs-ordering" ? (
          <div className="mt-4 grid gap-3">
            {!loading && !error && needsOrdering.length === 0 ? (
              <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-5 text-sm text-[color:var(--theme-text-secondary)]">
                Every approved request is fully ordered.
              </div>
            ) : null}

            {needsOrdering.map((item) => {
              const request = requestById.get(item.request_id);
              const orderRemaining = requestRemainingToOrder(item);
              const supplier = item.vendor_id
                ? supplierById.get(item.vendor_id)
                : null;
              return (
                <article
                  key={item.id}
                  className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]">
                        {workOrderLabel(
                          item.work_order_id || request?.work_order_id,
                        )}
                      </div>
                      <h3 className="mt-1 text-base font-semibold text-[color:var(--theme-text-primary)]">
                        {item.description}
                      </h3>
                      <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                        {supplier
                          ? `Assigned supplier: ${supplier.name}`
                          : "Choose the supplier when ordering"}
                      </p>
                    </div>
                    <PackagePlus
                      aria-hidden
                      className="h-5 w-5 shrink-0 text-[color:var(--accent-copper)]"
                    />
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    {[
                      ["Approved", requestTargetQuantity(item)],
                      ["Ordered", numeric(item.qty_ordered)],
                      ["Remaining", orderRemaining],
                    ].map(([label, value]) => (
                      <div
                        key={String(label)}
                        className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-2"
                      >
                        <span className="block text-[10px] text-[color:var(--theme-text-secondary)]">
                          {label}
                        </span>
                        <strong className="mt-0.5 block text-sm text-[color:var(--theme-text-primary)]">
                          {formatQuantity(Number(value))}
                        </strong>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-[color:var(--theme-text-secondary)]">
                      Cost: {formatMoney(item.unit_cost)}
                    </span>
                    <button
                      type="button"
                      className={primaryActionClass}
                      onClick={() => openOrder(item)}
                      disabled={locations.length === 0}
                    >
                      Order {formatQuantity(orderRemaining)}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 grid gap-3">
            {!loading && !error && purchaseOrders.length === 0 ? (
              <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-5 text-sm text-[color:var(--theme-text-secondary)]">
                No purchase orders have been created yet.
              </div>
            ) : null}

            {purchaseOrders.map((purchaseOrder) => {
              const supplier = supplierById.get(purchaseOrder.supplier_id);
              const poLines = linesByPoId.get(purchaseOrder.id) ?? [];
              const identity = purchaseOrderIdentity({
                id: purchaseOrder.id,
                poNumber: purchaseOrder.po_number,
                workOrderNumber: (() => {
                  if (purchaseOrder.work_order_id) {
                    return workOrderLabel(purchaseOrder.work_order_id);
                  }
                  const linkedWorkOrderIds = Array.from(
                    new Set(
                      poLines
                        .map((line) =>
                          line.part_request_item_id
                            ? itemById.get(line.part_request_item_id)
                                ?.work_order_id
                            : null,
                        )
                        .filter((id): id is string => Boolean(id)),
                    ),
                  );
                  if (linkedWorkOrderIds.length === 1) {
                    return workOrderLabel(linkedWorkOrderIds[0]);
                  }
                  return linkedWorkOrderIds.length > 1
                    ? "Multiple work orders"
                    : "Stock purchase";
                })(),
              });
              const ordered = poLines.reduce(
                (sum, line) =>
                  sum +
                  Math.max(0, numeric(line.qty) - numeric(line.cancelled_qty)),
                0,
              );
              const received = poLines.reduce(
                (sum, line) => sum + numeric(line.received_qty),
                0,
              );

              return (
                <article
                  key={purchaseOrder.id}
                  className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]">
                        {identity.secondary}
                      </div>
                      <h3 className="mt-1 text-base font-semibold text-[color:var(--theme-text-primary)]">
                        {supplier?.name || "Unknown supplier"}
                      </h3>
                      <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                        {identity.primary} · Created{" "}
                        {formatDate(purchaseOrder.created_at)}
                        {purchaseOrder.expected_at
                          ? ` · Expected ${formatDate(purchaseOrder.expected_at)}`
                          : ""}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${statusTone(
                        purchaseOrder.status,
                      )}`}
                    >
                      {purchaseOrder.status}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    {[
                      ["Lines", poLines.length],
                      ["Ordered", ordered],
                      ["Received", received],
                    ].map(([label, value]) => (
                      <div
                        key={String(label)}
                        className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-2"
                      >
                        <span className="block text-[10px] text-[color:var(--theme-text-secondary)]">
                          {label}
                        </span>
                        <strong className="mt-0.5 block text-sm text-[color:var(--theme-text-primary)]">
                          {formatQuantity(Number(value))}
                        </strong>
                      </div>
                    ))}
                  </div>

                  <details className="mt-3 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)]">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 text-sm font-semibold text-[color:var(--theme-text-primary)]">
                      PO lines
                      <ChevronDown aria-hidden className="h-4 w-4" />
                    </summary>
                    <div className="grid gap-2 border-t border-[color:var(--theme-border-soft)] p-2">
                      {poLines.length === 0 ? (
                        <div className="p-2 text-xs text-[color:var(--theme-text-secondary)]">
                          This PO has no lines yet.
                        </div>
                      ) : null}
                      {poLines.map((line) => {
                        const remaining = purchaseOrderLineRemaining(line);
                        const requestItem = line.part_request_item_id
                          ? itemById.get(line.part_request_item_id)
                          : null;
                        return (
                          <div
                            key={line.id}
                            className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-3"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="font-semibold text-[color:var(--theme-text-primary)]">
                                  {requestItem?.description ||
                                    clean(line.description) ||
                                    clean(line.sku) ||
                                    "Purchase-order line"}
                                </div>
                                <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                                  Ordered{" "}
                                  {formatQuantity(
                                    Math.max(
                                      0,
                                      numeric(line.qty) -
                                        numeric(line.cancelled_qty),
                                    ),
                                  )}{" "}
                                  · Received{" "}
                                  {formatQuantity(numeric(line.received_qty))} ·
                                  Remaining {formatQuantity(remaining)}
                                </div>
                              </div>
                              {remaining <= 0 ? (
                                <PackageCheck
                                  aria-label="Fully received"
                                  className="h-5 w-5 shrink-0 text-emerald-500"
                                />
                              ) : null}
                            </div>
                            {remaining > 0 &&
                            purchaseOrderCanReceive(purchaseOrder.status) ? (
                              <button
                                type="button"
                                className={`${primaryActionClass} mt-3 w-full`}
                                onClick={() => openReceive(purchaseOrder, line)}
                                disabled={
                                  Boolean(line.part_id) && locations.length === 0
                                }
                              >
                                Receive {formatQuantity(remaining)}
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </details>

                  <div className="mt-3 flex justify-end">
                    {clean(purchaseOrder.status).toLowerCase() === "draft" &&
                    poLines.some(
                      (line) =>
                        numeric(line.qty) - numeric(line.cancelled_qty) > 0,
                    ) ? (
                      <button
                        type="button"
                        className={`${primaryActionClass} mr-2`}
                        onClick={() => void placePurchaseOrder(purchaseOrder)}
                        disabled={Boolean(placingPoId)}
                      >
                        {placingPoId === purchaseOrder.id
                          ? "Placing..."
                          : "Mark placed"}
                      </button>
                    ) : null}
                    {supplier?.email ? (
                      <a
                        href={`mailto:${encodeURIComponent(supplier.email)}`}
                        className={`${actionClass} mr-2`}
                      >
                        Email supplier
                      </a>
                    ) : supplier?.phone ? (
                      <a
                        href={`tel:${encodeURIComponent(supplier.phone)}`}
                        className={`${actionClass} mr-2`}
                      >
                        Call supplier
                      </a>
                    ) : null}
                    <Link
                      href={`/parts/po/${encodeURIComponent(purchaseOrder.id)}`}
                      className={actionClass}
                    >
                      Full PO record
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {orderDraft ? (
        <div className="fixed inset-0 z-[700] flex items-end justify-center bg-black/55 p-3 backdrop-blur-sm sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Add approved part to purchase order"
            className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel-strong)] p-5 shadow-[var(--theme-shadow-medium)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--accent-copper)]">
                  Author purchase order
                </div>
                <h3 className="mt-1 text-xl font-semibold text-[color:var(--theme-text-primary)]">
                  {orderDraft.item.description}
                </h3>
              </div>
              <button
                type="button"
                className={actionClass}
                aria-label="Close purchase-order authoring"
                onClick={() => setOrderDraft(null)}
                disabled={submitting}
              >
                <X aria-hidden className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              <label className="text-sm text-[color:var(--theme-text-secondary)]">
                Supplier
                <select
                  className={fieldClass}
                  value={orderDraft.supplierId}
                  disabled={Boolean(orderDraft.item.vendor_id)}
                  onChange={(event) =>
                    setOrderDraft((current) =>
                      current
                        ? {
                            ...current,
                            supplierId: event.target.value,
                            newSupplierName: "",
                          }
                        : current,
                    )
                  }
                >
                  <option value="">Create a new supplier</option>
                  {(orderDraft.item.vendor_id
                    ? suppliers.filter(
                        (supplier) => supplier.id === orderDraft.item.vendor_id,
                      )
                    : activeSuppliers
                  ).map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </label>

              {!orderDraft.supplierId ? (
                <label className="text-sm text-[color:var(--theme-text-secondary)]">
                  New supplier name
                  <input
                    className={fieldClass}
                    value={orderDraft.newSupplierName}
                    maxLength={160}
                    onChange={(event) =>
                      setOrderDraft((current) =>
                        current
                          ? { ...current, newSupplierName: event.target.value }
                          : current,
                      )
                    }
                  />
                </label>
              ) : null}

              <label className="text-sm text-[color:var(--theme-text-secondary)]">
                Receiving location
                <select
                  className={fieldClass}
                  value={orderDraft.locationId}
                  onChange={(event) =>
                    setOrderDraft((current) =>
                      current
                        ? { ...current, locationId: event.target.value }
                        : current,
                    )
                  }
                >
                  <option value="">Select a location</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.code} — {location.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm text-[color:var(--theme-text-secondary)]">
                  Quantity
                  <input
                    className={fieldClass}
                    type="number"
                    min="0.01"
                    step="0.01"
                    max={requestRemainingToOrder(orderDraft.item)}
                    value={orderDraft.qty}
                    onChange={(event) =>
                      setOrderDraft((current) =>
                        current
                          ? { ...current, qty: numeric(event.target.value) }
                          : current,
                      )
                    }
                  />
                </label>
                <label className="text-sm text-[color:var(--theme-text-secondary)]">
                  Unit cost
                  <input
                    className={fieldClass}
                    type="number"
                    min="0"
                    step="0.01"
                    value={orderDraft.unitCost}
                    placeholder={
                      orderDraft.item.part_id ? "Optional" : "Required"
                    }
                    onChange={(event) =>
                      setOrderDraft((current) =>
                        current
                          ? {
                              ...current,
                              unitCost:
                                event.target.value === ""
                                  ? ""
                                  : numeric(event.target.value),
                            }
                          : current,
                      )
                    }
                  />
                </label>
              </div>

              <label className="text-sm text-[color:var(--theme-text-secondary)]">
                PO note
                <textarea
                  className={`${fieldClass} min-h-20 py-2`}
                  value={orderDraft.notes}
                  maxLength={2000}
                  onChange={(event) =>
                    setOrderDraft((current) =>
                      current
                        ? { ...current, notes: event.target.value }
                        : current,
                    )
                  }
                />
              </label>
            </div>

            <p className="mt-3 text-xs text-[color:var(--theme-text-secondary)]">
              The approved quantity is the ceiling. Matching draft POs for this
              supplier are reused automatically.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className={actionClass}
                onClick={() => setOrderDraft(null)}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className={primaryActionClass}
                onClick={() => void submitOrder()}
                disabled={submitting}
              >
                {submitting ? "Saving..." : "Create / add to PO"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {receiveDraft ? (
        <div className="fixed inset-0 z-[700] flex items-end justify-center bg-black/55 p-3 backdrop-blur-sm sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Receive purchase-order line"
            className="w-full max-w-lg rounded-3xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel-strong)] p-5 shadow-[var(--theme-shadow-medium)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-[color:var(--accent-copper)]">
                  Receive purchase order
                </div>
                <h3 className="mt-1 text-xl font-semibold text-[color:var(--theme-text-primary)]">
                  {clean(receiveDraft.line.description) ||
                    clean(receiveDraft.line.sku) ||
                    "Purchase-order line"}
                </h3>
              </div>
              <button
                type="button"
                className={actionClass}
                aria-label="Close purchase-order receipt"
                onClick={() => setReceiveDraft(null)}
                disabled={submitting}
              >
                <X aria-hidden className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-3 text-sm text-[color:var(--theme-text-secondary)]">
              Remaining on this line:{" "}
              {formatQuantity(purchaseOrderLineRemaining(receiveDraft.line))}
            </div>

            {receiveDraft.line.part_id ? (
              <label className="mt-3 block text-sm text-[color:var(--theme-text-secondary)]">
                Receiving location
                <select
                  className={fieldClass}
                  value={receiveDraft.locationId}
                  onChange={(event) =>
                    setReceiveDraft((current) =>
                      current
                        ? { ...current, locationId: event.target.value }
                        : current,
                    )
                  }
                >
                  <option value="">Select a location</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.code} — {location.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="mt-3 text-xs text-[color:var(--theme-text-secondary)]">
                This free-text receipt updates the PO only and does not create
                inventory stock.
              </p>
            )}

            <label className="mt-3 block text-sm text-[color:var(--theme-text-secondary)]">
              Quantity received
              <input
                className={fieldClass}
                type="number"
                min="0.01"
                step="0.01"
                max={purchaseOrderLineRemaining(receiveDraft.line)}
                value={receiveDraft.qty}
                onChange={(event) =>
                  setReceiveDraft((current) =>
                    current
                      ? { ...current, qty: numeric(event.target.value) }
                      : current,
                  )
                }
              />
            </label>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className={actionClass}
                onClick={() => setReceiveDraft(null)}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className={primaryActionClass}
                onClick={() => void submitReceive()}
                disabled={submitting}
              >
                {submitting ? "Receiving..." : "Receive against PO"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
