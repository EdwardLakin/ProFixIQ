// app/parts/requests/[id]/page.tsx  (PART 1/2)
"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import { toast } from "sonner";
import type { Database } from "@shared/types/types/supabase";
import {
  RequestHeaderSection,
  RequestItemsTable,
  RequestProcurementPanel,
  RequestReceivingPanel,
  RequestStatusSummary,
} from "./request-detail-components";
import {
  PARTS_REQUEST_WORKBENCH_V2_LOCAL_FLAG,
  PartsRequestWorkbench,
  mapRequestToWorkbenchModel,
  type SaveItemInput,
} from "@/features/parts/components/request-workbench";
import {
  itemFlowLabel,
  requestFlowLabel,
  toItemFlowDisplay,
  toRequestFlowDisplay,
} from "@/features/parts/lib/status-display";
import {
  buildPartTrustMeta,
  trustBadgeTone,
  trustLevelLabel,
  type PartTrustLevel,
  type PartTrustMeta,
} from "@/features/parts/lib/trust-signals";
import {
  buildDeterministicStockSuggestions,
  detectPartDescriptionConflict,
  type DeterministicStockSuggestion,
} from "@/features/parts/lib/parts/deterministicStockMatcher";
import {
  buildDeterministicSupplierSuggestions,
  type DeterministicSupplierSuggestion,
} from "@/features/parts/lib/parts/deterministicSupplierMatcher";
import { getStockSuggestionDisplay } from "@/features/parts/lib/parts/suggestionDisplay";
import {
  loadStockOnHandByPartId,
  toStockSummaryRowsFromOnHand,
} from "@/features/parts/lib/stock-on-hand";
import { calculateOrderCoverage } from "@/features/parts/lib/order-quantity";

type DB = Database;

type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type RequestRow = DB["public"]["Tables"]["part_requests"]["Row"];
type ItemRow = DB["public"]["Tables"]["part_request_items"]["Row"];
type PartRow = DB["public"]["Tables"]["parts"]["Row"];
type PartTrustFields = Pick<
  DB["public"]["Tables"]["parts"]["Row"],
  "id" | "sku" | "part_number" | "normalized_part_key" | "source_intake_id"
> & { import_confidence?: number | null };
type LocationRow = DB["public"]["Tables"]["stock_locations"]["Row"];
type PurchaseOrderRow = DB["public"]["Tables"]["purchase_orders"]["Row"];
type SupplierRow = DB["public"]["Tables"]["suppliers"]["Row"];

type WorkOrderLineRow = DB["public"]["Tables"]["work_order_lines"]["Row"];
type LineLite = Pick<WorkOrderLineRow, "id" | "complaint" | "description">;

type Status = RequestRow["status"];

const OPERATIONAL_REQUEST_STATUSES = new Set<string>([
  "approved",
  "partially_ordered",
  "partially_consumed",
  "partially_returned",
]);

function isRequestOperationallyReleased(status: unknown): boolean {
  return OPERATIONAL_REQUEST_STATUSES.has(String(status ?? "").toLowerCase());
}

type UiItem = ItemRow & {
  ui_part_id: string | null;
  ui_qty: number;
  ui_price?: number; // sell/unit (undefined = not set)
  ui_added?: boolean; // purely UI “added” state (not used for logic)

  // PO assignment UI
  ui_po_id?: string; // derived from it.po_id (if exists) else ""
  ui_supplier_id?: string; // for create/select (optional helper)
};

type CreateInventoryDraft = {
  requestId: string;
  itemId: string;
  name: string;
  partNumber: string;
  manufacturer: string;
  sku: string;
  category: string;
  price: string;
  supplier: string;
  initialQty?: string;
  locationId?: string;
};

type RequestUi = {
  req: RequestRow;
  items: UiItem[];
};

type DrawerItem = {
  id: string;
  created_at?: string | null;
  request_id?: string | null;
  part_id?: string | null;
  description?: string | null;
  status?: string | null;
  qty_approved?: number | null;
  qty_received?: number | null;
  qty_remaining?: number | null;
  part_name?: string | null;
  sku?: string | null;
  trust_level?: PartTrustLevel;
  trust_reasons?: string[];
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function toNum(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Strict UUID check for uuid-typed columns (prevents PostgREST 400 casts). */
function isUuid(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const s = v.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s,
  );
}

function looksLikeUuid(s: string): boolean {
  return s.includes("-") && s.length >= 36;
}

function splitCustomId(raw: string): { prefix: string; n: number | null } {
  const m = raw.toUpperCase().match(/^([A-Z]+)\s*0*?(\d+)?$/);
  if (!m) return { prefix: raw.toUpperCase(), n: null };
  const n = m[2] ? parseInt(m[2], 10) : null;
  return { prefix: m[1], n: Number.isFinite(n ?? NaN) ? n : null };
}

/**
 * IMPORTANT:
 * - work_order_line_id is uuid in most schemas.
 * - part_requests.job_id may be legacy/non-uuid in some setups.
 * This helper ONLY returns valid UUIDs to avoid PostgREST 400 errors.
 */
function resolveWorkOrderLineId(
  currentReq: RequestRow,
  list: UiItem[],
): string | null {
  for (const it of list) {
    const v = it.work_order_line_id;
    if (isUuid(v)) return v;
  }
  const j = currentReq.job_id;
  if (isUuid(j)) return j;
  return null;
}

function isRowComplete(it: UiItem): boolean {
  // ONLY persisted values count
  const hasPart = isNonEmptyString(it.part_id ?? null);
  const hasPrice = it.quoted_price != null;
  const qty = toNum(it.qty, 0);
  return hasPart && hasPrice && qty > 0;
}

function n(v: unknown): number {
  const num = typeof v === "number" ? v : Number(v);
  return Number.isFinite(num) ? num : 0;
}

const ReceiveDrawer = dynamic(
  () => import("@/features/parts/components/ReceiveDrawer"),
  {
    ssr: false,
  },
);

type Opt = { value: string; label: string };

function normalizeName(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

function lineLabelFrom(line?: LineLite): string {
  if (!line) return "";
  const a = String(line.description ?? "").trim();
  if (a) return a;
  const b = String(line.complaint ?? "").trim();
  return b;
}


export default function PartsRequestsForWorkOrderPage(): JSX.Element {
  const { id: routeId } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createBrowserSupabase(), []);

  const [wo, setWo] = useState<WorkOrderRow | null>(null);
  const [lineById, setLineById] = useState<Map<string, LineLite>>(
    () => new Map(),
  );
  const [requests, setRequests] = useState<RequestUi[]>([]);
  const [parts, setParts] = useState<PartRow[]>([]);
  const [trustByPartId, setTrustByPartId] = useState<Record<string, PartTrustMeta>>({});
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [defaultLocationId, setDefaultLocationId] = useState<string>("");
  const [stockSuggestionsByItemId, setStockSuggestionsByItemId] = useState<Record<string, DeterministicStockSuggestion[]>>({});
  const [stockAvailableByPartId, setStockAvailableByPartId] = useState<Record<string, number>>({});
  const [supplierSuggestionsByItemId, setSupplierSuggestionsByItemId] = useState<Record<string, DeterministicSupplierSuggestion[]>>({});
  const [supplierSuggestionAppliedByItemId, setSupplierSuggestionAppliedByItemId] = useState<Record<string, boolean>>({});
  const [conflictWarningByItemId, setConflictWarningByItemId] = useState<Record<string, string>>({});
  const [conflictOverrideByItemId, setConflictOverrideByItemId] = useState<Record<string, boolean>>({});
  const [addedToWorkOrderByItemId, setAddedToWorkOrderByItemId] = useState<Record<string, boolean>>({});
  const [packageCommitWarningByItemId, setPackageCommitWarningByItemId] = useState<Record<string, string>>({});

  function clearConflictOverride(itemId: string): void {
    setConflictOverrideByItemId((prev) => {
      if (!prev[itemId]) return prev;
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    setConflictWarningByItemId((prev) => {
      if (!prev[itemId]) return prev;
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  }

  function confirmConflictOverride(itemId: string): void {
    setConflictOverrideByItemId((prev) => ({ ...prev, [itemId]: true }));
  }
  const [createInventoryDraft, setCreateInventoryDraft] = useState<CreateInventoryDraft | null>(null);

  const [pos, setPOs] = useState<PurchaseOrderRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [selectedPo, setSelectedPo] = useState<string>("");

  const [loading, setLoading] = useState<boolean>(true);
  const [savingReqId, setSavingReqId] = useState<string | null>(null);
  const [savingItemId, setSavingItemId] = useState<string | null>(null);

  // Drawer
  const [recvOpen, setRecvOpen] = useState<boolean>(false);
  const [recvItem, setRecvItem] = useState<DrawerItem | null>(null);

  // ---- Theme (glass + neutral accent styling) ----
  const ACCENT_BORDER = "border-[color:var(--desktop-border-strong)]";
  const ACCENT_TEXT = "text-[var(--theme-text-primary,var(--theme-text-primary))]";
  const ACCENT_HOVER_BG = "hover:bg-[color:color-mix(in_srgb,var(--brand-accent,#38bdf8)_12%,transparent)]";
  const ACCENT_FOCUS_RING = "focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--brand-accent,#38bdf8)_35%,transparent)]";

  const pageWrap = "space-y-4 p-4 text-[color:var(--theme-text-primary)]";
  const glassCard =
    "rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-panel-bg-soft)] backdrop-blur-xl shadow-[0_0_0_1px_rgba(255,255,255,0.03)_inset]";
  const glassHeader =
    "bg-[var(--theme-gradient-panel)] border-b border-[color:var(--desktop-border)]";
  const inputBase = `rounded-lg border bg-[color:var(--desktop-item-bg)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)] border-[color:var(--desktop-border)] focus:outline-none ${ACCENT_FOCUS_RING}`;
  const selectBase = `rounded-lg border bg-[color:var(--desktop-item-bg)] px-2 py-2 text-xs text-[color:var(--theme-text-primary)] border-[color:var(--desktop-border)] focus:outline-none ${ACCENT_FOCUS_RING}`;

  const btnBase =
    "inline-flex items-center justify-center rounded-lg border px-3 py-2 text-sm transition disabled:opacity-60";
  const btnGhost = `${btnBase} border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] hover:bg-[color:color-mix(in_srgb,var(--desktop-item-bg)_80%,_var(--theme-surface-page))]`;
  const btnCopper = `${btnBase} ${ACCENT_BORDER} ${ACCENT_TEXT} bg-[color:var(--theme-surface-page)] ${ACCENT_HOVER_BG}`;
  const btnDanger = `${btnBase} border-red-900/60 bg-[color:var(--theme-surface-page)] text-red-200 hover:bg-red-900/20`;

  const pillBase =
    "inline-flex items-center whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium";
  const pillNeedsQuote = `${pillBase} border-red-500/35 bg-red-950/35 text-red-200`;
  const pillQuoted = `${pillBase} border-teal-500/35 bg-teal-950/25 text-teal-200`;
  const pillProgress = `${pillBase} border-sky-500/45 bg-sky-950/25 text-sky-100`;
  const pillComplete = `${pillBase} border-emerald-500/35 bg-emerald-950/25 text-emerald-200`;

  const supplierNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of suppliers) {
      const id = String(s.id);
      const nm =
        typeof s.name === "string" && s.name.trim()
          ? s.name.trim()
          : id.slice(0, 8);
      m.set(id, nm);
    }
    return m;
  }, [suppliers]);

  const poLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const po of pos) {
      const id = String(po.id);
      const supplierId = (po.supplier_id as string | null) ?? null;
      const supplierName = supplierId
        ? supplierNameById.get(String(supplierId)) ??
          String(supplierId).slice(0, 8)
        : "—";
      const st = String(po.status ?? "open");
      m.set(id, `${id.slice(0, 8)} • ${supplierName} • ${st}`);
    }
    return m;
  }, [pos, supplierNameById]);


  function getEffectiveWorkOrderLineId(req: RequestRow, items: UiItem[]): string | null {
    const linked = resolveWorkOrderLineId(req, items);
    if (linked && isUuid(linked)) return linked;

    if (lineById.size === 1) {
      const only = Array.from(lineById.keys())[0];
      return isUuid(only) ? only : null;
    }

    return null;
  }

  async function resolveWorkOrder(
    idOrCustom: string,
  ): Promise<WorkOrderRow | null> {
    const raw = (idOrCustom ?? "").trim();
    if (!raw) return null;

    if (looksLikeUuid(raw)) {
      const { data, error } = await supabase
        .from("work_orders")
        .select("*")
        .eq("id", raw)
        .maybeSingle();
      if (!error && data) return data as WorkOrderRow;
    }

    {
      const { data } = await supabase
        .from("work_orders")
        .select("*")
        .eq("custom_id", raw)
        .maybeSingle();
      if (data) return data as WorkOrderRow;
    }

    {
      const { data } = await supabase
        .from("work_orders")
        .select("*")
        .ilike("custom_id", raw.toUpperCase())
        .maybeSingle();
      if (data) return data as WorkOrderRow;
    }

    {
      const { prefix, n } = splitCustomId(raw);
      if (n != null) {
        const { data: cands } = await supabase
          .from("work_orders")
          .select("*")
          .ilike("custom_id", `${prefix}%`)
          .limit(50);
        const wanted = `${prefix}${n}`;
        const match = (cands ?? []).find((r) => {
          const cid = (r.custom_id ?? "")
            .toUpperCase()
            .replace(/^([A-Z]+)0+/, "$1");
          return cid === wanted;
        });
        if (match) return match as WorkOrderRow;
      }
    }

    return null;
  }

  async function load(options: { preserveContent?: boolean } = {}): Promise<void> {
    const preserveContent = options.preserveContent === true;
    if (!preserveContent) setLoading(true);

    let requestIdFilter: string | null = null;
    let woRow = await resolveWorkOrder(routeId);

    // Quote Review links to the canonical request id. Keep supporting the
    // older work-order id/custom-id route while resolving a request id to its
    // owning work order and limiting the page to that request.
    if (!woRow && isUuid(routeId)) {
      const { data: requestById, error: requestLookupError } = await supabase
        .from("part_requests")
        .select("id, work_order_id")
        .eq("id", routeId)
        .maybeSingle();

      if (requestLookupError) toast.error(requestLookupError.message);

      const linkedWorkOrderId = requestById?.work_order_id
        ? String(requestById.work_order_id)
        : "";
      if (linkedWorkOrderId && requestById) {
        woRow = await resolveWorkOrder(linkedWorkOrderId);
        requestIdFilter = String(requestById.id);
      }
    }

    if (!woRow) {
      setWo(null);
      setLineById(new Map());
      setRequests([]);
      setParts([]);
      setLocations([]);
      setDefaultLocationId("");
      setPOs([]);
      setSuppliers([]);
      setSelectedPo("");
      setStockSuggestionsByItemId({});
      setStockAvailableByPartId({});
      setSupplierSuggestionsByItemId({});
      setSupplierSuggestionAppliedByItemId({});
      setAddedToWorkOrderByItemId({});
      setLoading(false);
      return;
    }

    setWo(woRow);

    const requestsForWorkOrder = supabase
      .from("part_requests")
      .select("*")
      .eq("work_order_id", woRow.id);
    const requestQuery = requestIdFilter
      ? requestsForWorkOrder.eq("id", requestIdFilter)
      : requestsForWorkOrder;
    const { data: reqs, error: reqErr } = await requestQuery.order("created_at", {
      ascending: false,
    });

    if (reqErr) toast.error(reqErr.message);

    const reqList = (reqs ?? []) as RequestRow[];
    const reqIds = reqList.map((r) => r.id);
    const shopId = woRow.shop_id ?? null;

    const itemsByRequest: Record<string, ItemRow[]> = {};
    if (reqIds.length) {
      const { data: items, error: itErr } = await supabase
        .from("part_request_items")
        .select("*")
        .in("request_id", reqIds);
      if (itErr) toast.error(itErr.message);

      for (const it of (items ?? []) as ItemRow[]) {
        (itemsByRequest[it.request_id] ||= []).push(it);
      }
    }

    const uiRequests: RequestUi[] = reqList.map((r) => {
      const itemRows = itemsByRequest[r.id] ?? [];
      const uiItems: UiItem[] = itemRows
        .sort((a, b) => String(a.id).localeCompare(String(b.id)))
        .map((row) => {
          const sell =
            row.quoted_price == null ? undefined : toNum(row.quoted_price, 0);
          const poId =
            (row as unknown as { po_id?: string | null }).po_id ?? null;
          return {
            ...row,
            ui_part_id: row.part_id ?? null,
            ui_qty: toNum(row.qty, 1),
            ui_price: sell,
            ui_added: false,
            ui_po_id: poId ? String(poId) : "",
          };
        });

      return { req: r, items: uiItems };
    });

    setRequests(uiRequests);

    const requestItemIds = uiRequests.flatMap((request) => request.items.map((item) => String(item.id)));
    if (requestItemIds.length > 0) {
      const { data: attachedRows, error: attachedError } = await supabase
        .from("work_order_parts")
        .select("source_parts_request_item_id")
        .in("source_parts_request_item_id", requestItemIds)
        .eq("shop_id", shopId)
        .eq("is_active", true);
      if (attachedError) {
        toast.warning(attachedError.message);
        setAddedToWorkOrderByItemId({});
      } else {
        setAddedToWorkOrderByItemId(Object.fromEntries(
          ((attachedRows ?? []) as Array<{ source_parts_request_item_id: string | null }>).flatMap((row) =>
            row.source_parts_request_item_id ? [[String(row.source_parts_request_item_id), true] as const] : [],
          ),
        ));
      }
    } else {
      setAddedToWorkOrderByItemId({});
    }

    // ✅ Load all line complaint/description for this work order (used for UI + fallback linking)
    {
      const { data: lines, error: lErr } = await supabase
        .from("work_order_lines")
        .select("id, complaint, description")
        .eq("work_order_id", woRow.id);

      if (lErr) {
        toast.warning(lErr.message);
        setLineById(new Map());
      } else {
        const m = new Map<string, LineLite>();
        for (const l of (lines ?? []) as LineLite[]) {
          m.set(String(l.id), l);
        }
        setLineById(m);
      }
    }

    if (shopId) {
      const [{ data: ps }, { data: locs }, { data: poRows }, { data: supRows }, { data: vendorRows }] =
        await Promise.all([
          supabase
            .from("parts")
            .select("*")
            .eq("shop_id", shopId)
            .order("name")
            .limit(1000),
          supabase
            .from("stock_locations")
            .select("*")
            .eq("shop_id", shopId)
            .order("code"),
          supabase
            .from("purchase_orders")
            .select("*")
            .eq("shop_id", shopId)
            .order("created_at", { ascending: false })
            .limit(200),
          supabase
            .from("suppliers")
            .select("*")
            .eq("shop_id", shopId)
            .order("name", { ascending: true })
            .limit(500),
          supabase
            .from("vendor_part_numbers")
            .select("id, part_id, shop_id, supplier_id, vendor_sku")
            .eq("shop_id", shopId)
            .limit(2000),
        ]);
      const poIds = ((poRows ?? []) as PurchaseOrderRow[]).map((po) => String(po.id));
      let poLineRows: DB["public"]["Tables"]["purchase_order_lines"]["Row"][] = [];
      if (poIds.length > 0) {
        const { data: lineRows } = await supabase
          .from("purchase_order_lines")
          .select("po_id, part_id, description, unit_cost, created_at")
          .in("po_id", poIds)
          .order("created_at", { ascending: false })
          .limit(2000);
        poLineRows = ((lineRows ?? []) as unknown) as DB["public"]["Tables"]["purchase_order_lines"]["Row"][];
      }

      const partRows = (ps ?? []) as PartRow[];
      setParts(partRows);
      const trustMap: Record<string, PartTrustMeta> = {};
      partRows.forEach((part) => {
        const p = part as PartTrustFields;
        trustMap[String(p.id)] = buildPartTrustMeta({
          sku: p.sku ?? null,
          partNumber: p.part_number ?? null,
          normalizedPartKey: p.normalized_part_key ?? null,
          sourceIntakeId: p.source_intake_id ?? null,
          importConfidence: p.import_confidence ?? null,
        });
      });
      setTrustByPartId(trustMap);

      const locList = (locs ?? []) as LocationRow[];
      setLocations(locList);

      const main = locList.find(
        (l) => String(l.code ?? "").toUpperCase() === "MAIN",
      );
      const chosen = main?.id
        ? String(main.id)
        : locList[0]?.id
          ? String(locList[0].id)
          : "";
      setDefaultLocationId(chosen);

      setPOs((poRows ?? []) as PurchaseOrderRow[]);
      setSuppliers((supRows ?? []) as SupplierRow[]);

      const suggestions: Record<string, DeterministicStockSuggestion[]> = {};
      const supplierSuggestions: Record<string, DeterministicSupplierSuggestion[]> = {};
      let stockAvailableRecord: Record<string, number> = {};
      try {
        stockAvailableRecord = await loadStockOnHandByPartId(
          supabase,
          shopId,
          partRows.map((part) => String(part.id)),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to load inventory stock.";
        toast.error(`Inventory stock could not be loaded: ${message}`);
      }
      const stockSummaryRows = toStockSummaryRowsFromOnHand(stockAvailableRecord);
      const stockAvailableMap = new Map<string, number>(Object.entries(stockAvailableRecord));
      setStockAvailableByPartId(stockAvailableRecord);
      for (const req of uiRequests) {
        for (const item of req.items) {
          const desc = String(item.description ?? "").trim();
          if (!desc) continue;
          const ranked = buildDeterministicStockSuggestions({
            requestedDescription: desc,
            requestedPartNumber: item.requested_part_number,
            requestedManufacturer: item.requested_manufacturer,
            requestedQty: toNum(item.qty, 1),
            parts: partRows,
            stockSummaries: stockSummaryRows,
            vendorPartNumbers: ((vendorRows ?? []) as unknown) as DB["public"]["Tables"]["vendor_part_numbers"]["Row"][],
            limit: 2,
          });
          if (ranked.length > 0) suggestions[String(item.id)] = ranked;
          const hasAttachedPart = isUuid(item.part_id);
          const topStockSuggestion = ranked[0] ?? null;
          const selectedPartId = isUuid(item.part_id) ? item.part_id : (isUuid(item.ui_part_id) ? item.ui_part_id : null);
          const selectedPartStock = selectedPartId ? (stockAvailableMap.get(String(selectedPartId)) ?? 0) : 0;
          const shouldSuggestSupplier =
            !hasAttachedPart ||
            !!topStockSuggestion?.recommended_action && topStockSuggestion.recommended_action === "order_part" ||
            (selectedPartId != null && selectedPartStock <= 0);
          if (shouldSuggestSupplier) {
            supplierSuggestions[String(item.id)] = buildDeterministicSupplierSuggestions({
              requestedDescription: desc,
              partId: selectedPartId,
              suppliers: ((supRows ?? []) as SupplierRow[]).map((s) => ({ id: s.id, name: s.name })),
              purchaseOrders: ((poRows ?? []) as PurchaseOrderRow[]).map((po) => ({
                id: po.id,
                supplier_id: po.supplier_id,
                status: po.status,
                created_at: po.created_at,
              })),
              purchaseOrderLines: poLineRows.map((line) => ({
                po_id: line.po_id,
                part_id: line.part_id,
                description: line.description,
                unit_cost: line.unit_cost,
                created_at: line.created_at,
              })),
              vendorPartNumbers: (((vendorRows ?? []) as unknown) as DB["public"]["Tables"]["vendor_part_numbers"]["Row"][]).map((v) => ({
                part_id: v.part_id,
                supplier_id: v.supplier_id,
                vendor_sku: v.vendor_sku,
              })),
              parts: partRows.map((p) => ({ id: p.id, supplier: p.supplier })),
            });
          }
        }
      }
      setStockSuggestionsByItemId(suggestions);
      setSupplierSuggestionsByItemId(supplierSuggestions);
      setSupplierSuggestionAppliedByItemId({});
      if (
        selectedPo &&
        !(poRows ?? []).some((p) => String(p.id) === selectedPo)
      )
        setSelectedPo("");
    } else {
      setParts([]);
      setTrustByPartId({});
      setLocations([]);
      setDefaultLocationId("");
      setPOs([]);
      setSuppliers([]);
      setSelectedPo("");
      setStockSuggestionsByItemId({});
      setStockAvailableByPartId({});
      setSupplierSuggestionsByItemId({});
      setSupplierSuggestionAppliedByItemId({});
    }

    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

  useEffect(() => {
    const handler = () => void load();
    window.addEventListener("parts:received", handler as EventListener);
    return () =>
      window.removeEventListener("parts:received", handler as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId]);

  function updateItem(
    reqId: string,
    itemId: string,
    patch: Partial<UiItem>,
  ): void {
    setRequests((prev) =>
      prev.map((r) => {
        if (r.req.id !== reqId) return r;
        return {
          ...r,
          items: r.items.map((it) =>
            it.id === itemId ? ({ ...it, ...patch } as UiItem) : it,
          ),
        };
      }),
    );
  }



  async function persistItemFields(
    itemId: string,
    patch: Pick<Partial<UiItem>, "description" | "requested_part_number" | "requested_manufacturer" | "qty" | "quoted_price">,
  ): Promise<void> {
    setSavingItemId(itemId);
    try {
      const res = await fetch(`/api/parts/requests/items/${itemId}/edit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; item?: ItemRow }
        | null;
      if (!res.ok || !body?.ok) {
        throw new Error(body?.error || "Update did not apply.");
      }
      if (body.item) {
        setRequests((prev) =>
          prev.map((r) => ({
            ...r,
            items: r.items.map((it) =>
              String(it.id) === String(itemId)
                ? ({
                    ...it,
                    ...body.item,
                    ui_qty: toNum(body.item?.qty, it.ui_qty),
                    ui_price:
                      body.item?.quoted_price == null
                        ? undefined
                        : toNum(body.item.quoted_price, it.ui_price ?? 0),
                  } as UiItem)
                : it,
            ),
          })),
        );
      }
    } finally {
      setSavingItemId(null);
    }
  }

  function openCreateInventoryModal(reqId: string, item: UiItem): void {
    const requestedPartNumber = String(item.requested_part_number ?? "").trim();
    const requestedManufacturer = String(item.requested_manufacturer ?? "").trim();
    setCreateInventoryDraft({
      requestId: reqId,
      itemId: String(item.id),
      name: String(item.description ?? requestedPartNumber).trim(),
      partNumber: requestedPartNumber,
      manufacturer: requestedManufacturer,
      sku: requestedPartNumber,
      category: "",
      price: item.ui_price == null ? "" : String(item.ui_price),
      supplier: requestedManufacturer,
      initialQty: "",
      locationId: defaultLocationId || "",
    });
  }

  async function saveCreatedInventoryItem(nextDraft?: CreateInventoryDraft): Promise<void> {
    const draft = nextDraft ?? createInventoryDraft;
    if (!wo?.shop_id || !draft) return;
    const name = draft.name.trim();
    const partNumber = draft.partNumber.trim();
    if (!name) {
      toast.error("Name is required.");
      return;
    }
    const priceNum = draft.price.trim() ? Number(draft.price) : null;
    if (priceNum != null && (!Number.isFinite(priceNum) || priceNum < 0)) {
      toast.error("Enter a valid price.");
      return;
    }

    const initialQtyNum = draft.initialQty?.trim() ? Number(draft.initialQty) : 0;
    if (!Number.isFinite(initialQtyNum) || initialQtyNum < 0) {
      toast.error("Enter a valid initial quantity.");
      return;
    }

    const stockLocationId = String(draft.locationId || defaultLocationId || "").trim();
    if (initialQtyNum > 0 && !isUuid(stockLocationId)) {
      toast.error("Select a stock location before adding initial quantity.");
      return;
    }

    console.info("[parts-request-v2:add-stock:start]", {
      requestId: draft.requestId,
      itemId: draft.itemId,
      name,
      partNumber,
      initialQty: initialQtyNum,
      stockLocationId,
    });

    setSavingItemId(draft.itemId);
    try {
      const insert: DB["public"]["Tables"]["parts"]["Insert"] = {
        shop_id: String(wo.shop_id),
        name,
        part_number: partNumber || null,
        sku: draft.sku.trim() || partNumber || null,
        category: draft.category.trim() || null,
        price: priceNum,
        default_price: priceNum,
        supplier: draft.supplier.trim() || draft.manufacturer.trim() || null,
      };
      const { data: part, error: partErr } = await supabase
        .from("parts")
        .insert(insert)
        .select("*")
        .single<PartRow>();
      if (partErr) {
        console.error("[parts-request-v2:add-stock:part-error]", partErr);
        toast.error(partErr.message);
        return;
      }

      if (initialQtyNum > 0) {
        const { error: stockMoveError } = await supabase.rpc("apply_stock_move", {
          p_part: part.id,
          p_loc: stockLocationId,
          p_qty: initialQtyNum,
          p_reason: "receive",
          p_ref_kind: "parts_request_initial_stock",
          p_ref_id: part.id,
        } as DB["public"]["Functions"]["apply_stock_move"]["Args"]);

        if (stockMoveError) {
          console.error("[parts-request-v2:add-stock:stock-move-error]", stockMoveError);
          toast.error(`Inventory item created, but stock quantity failed: ${stockMoveError.message}`);
          return;
        }
      }

      const update: DB["public"]["Tables"]["part_request_items"]["Update"] = {
        part_id: part.id,
        requested_part_number: partNumber || null,
        requested_manufacturer: draft.manufacturer.trim() || null,
      };
      const { error: itemErr } = await supabase
        .from("part_request_items")
        .update(update)
        .eq("id", draft.itemId);
      if (itemErr) {
        toast.error(itemErr.message);
        return;
      }

      setParts((prev) => [...prev, part].sort((a, b) => String(a.name).localeCompare(String(b.name))));
      updateItem(draft.requestId, draft.itemId, {
        part_id: part.id,
        ui_part_id: part.id,
        requested_part_number: partNumber || null,
        requested_manufacturer: draft.manufacturer.trim() || null,
        ui_price: priceNum ?? undefined,
      });
      setCreateInventoryDraft(null);
      console.info("[parts-request-v2:add-stock:success]", {
        requestId: draft.requestId,
        itemId: draft.itemId,
        partId: part.id,
        initialQty: initialQtyNum,
      });
      await load();
      toast.success("Inventory item created and attached.");
    } finally {
      setSavingItemId(null);
    }
  }

  function applySupplierSuggestionSelection(
    reqId: string,
    itemId: string,
    suggestion: DeterministicSupplierSuggestion,
  ): void {
    const patch: Partial<UiItem> = {};
    if (suggestion.supplier_id) patch.ui_supplier_id = String(suggestion.supplier_id);
    if (suggestion.open_po_id) patch.ui_po_id = String(suggestion.open_po_id);
    updateItem(reqId, itemId, patch);
    setSupplierSuggestionAppliedByItemId((prev) => ({ ...prev, [itemId]: true }));
  }

  function resolveAddPartId(it: UiItem): { partId: string | null; error?: string } {
    const selected = String(it.ui_part_id ?? it.part_id ?? "").trim();
    if (selected) return { partId: selected };

    const suggestions = stockSuggestionsByItemId[String(it.id)] ?? [];
    const strong = suggestions.filter(
      (s) =>
        s.confidence === "high" ||
        s.reasons.some((reason) =>
          ["exact sku match", "exact part number match", "vendor SKU match", "alias part number match"].includes(reason),
        ),
    );
    if (strong.length === 1) return { partId: strong[0].part_id };
    if (strong.length > 1 || suggestions.filter((s) => s.confidence !== "low").length > 1) {
      return { partId: null, error: "Choose an inventory match before adding." };
    }
    return { partId: null, error: "Pick a stock part first." };
  }

  function applyInventoryPartToItem(reqId: string, item: UiItem, partId: string | null): void {
    const selectedPart = partId
      ? parts.find((part) => String(part.id) === String(partId)) ?? null
      : null;
    const currentDesc = String(item.description ?? "").trim();

    updateItem(reqId, String(item.id), {
      ui_part_id: partId,
      description: currentDesc ? item.description : (selectedPart?.name ?? item.description ?? "").trim(),
      ui_price:
        item.ui_price ??
        (selectedPart?.price == null ? undefined : toNum(selectedPart.price, 0)),
    });
  }

  function getPartForConflict(partId: string | null): PartRow | null {
    return partId ? parts.find((p) => String(p.id) === String(partId)) ?? null : null;
  }

  async function clearRequestedPartNumber(reqId: string, itemId: string): Promise<void> {
    updateItem(reqId, itemId, { requested_part_number: null, ui_part_id: null });
    setConflictWarningByItemId((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    setConflictOverrideByItemId((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
    await persistItemFields(itemId, { requested_part_number: null });
    await load();
    toast.success("Part number cleared. Suggestions refreshed.");
  }

  async function syncRequestQuotedState(
    reqId: string,
    nextItems: UiItem[],
    currentStatus: Status,
  ): Promise<void> {
    const normalized = String(currentStatus ?? "").toLowerCase();
    if (normalized !== "requested" && normalized !== "quoted") return;

    const allQuoted = nextItems.length > 0 && nextItems.every((it) => isRowComplete(it));
    const desired: Status = allQuoted ? "quoted" : "requested";

    if (desired === currentStatus) return;

    const { error } = await supabase.rpc("set_part_request_status", {
      p_request: reqId,
      p_status: desired,
    });

    if (error) {
      toast.warning(error.message);
      return;
    }

    setRequests((prev) =>
      prev.map((r) =>
        r.req.id === reqId
          ? {
              ...r,
              req: { ...r.req, status: desired },
            }
          : r,
      ),
    );
  }

  async function addRow(reqId: string): Promise<void> {
    const target = requests.find((r) => r.req.id === reqId);
    if (!target) return;

    const resolvedLineId = getEffectiveWorkOrderLineId(target.req, target.items);
    const quoteLineId = target.req.quote_line_id ?? null;
    if ((!resolvedLineId || !isUuid(resolvedLineId)) && !quoteLineId) {
      toast.error("This parts request is not attached to a valid work order line yet.");
      return;
    }

    setSavingReqId(reqId);
    try {
      const lineId = getEffectiveWorkOrderLineId(target.req, target.items);
      const safeLineId = lineId && isUuid(lineId) ? lineId : null;
      const lineText =
        safeLineId ? lineLabelFrom(lineById.get(safeLineId)) : "";

      const insertPayload: DB["public"]["Tables"]["part_request_items"]["Insert"] =
        {
          request_id: target.req.id,
          shop_id: target.req.shop_id ?? undefined,
          work_order_id: target.req.work_order_id ?? undefined,
          quote_line_id: target.req.quote_line_id ?? undefined,
          work_order_line_id: safeLineId,
          description: lineText ? `(${lineText})` : "",
          qty: 1,
          quoted_price: null,
          vendor: null,
          part_id: null,
          // po_id intentionally omitted; set by per-item PO flow
        };

      const { data, error } = await supabase
        .from("part_request_items")
        .insert(insertPayload)
        .select("*")
        .maybeSingle<ItemRow>();

      if (error) {
        toast.error(error.message);
        return;
      }
      if (!data) {
        toast.error("Could not create a new item.");
        return;
      }

      const poId =
        (data as unknown as { po_id?: string | null }).po_id ?? null;

      const ui: UiItem = {
        ...data,
        ui_part_id: data.part_id ?? null,
        ui_qty: toNum(data.qty, 1),
        ui_price:
          data.quoted_price == null ? undefined : toNum(data.quoted_price, 0),
        ui_added: false,
        ui_po_id: poId ? String(poId) : "",
      };

      setRequests((prev) =>
        prev.map((r) =>
          r.req.id === reqId ? { ...r, items: [...r.items, ui] } : r,
        ),
      );

      await syncRequestQuotedState(
        reqId,
        [...target.items, ui],
        target.req.status,
      );
    } finally {
      setSavingReqId(null);
    }
  }

  async function deleteLine(reqId: string, itemId: string): Promise<void> {
    const ok = window.confirm("Remove this item from the request?");
    if (!ok) return;

    const target = requests.find((r) => r.req.id === reqId);
    if (!target) return;

    const { data: deleted, error } = await supabase
      .from("part_request_items")
      .delete()
      .eq("id", itemId)
      .select("id")
      .maybeSingle();

    if (error) {
      toast.error(error.message);
      return;
    }
    if (!deleted?.id) {
      toast.error("Not permitted to delete this item (RLS).");
      return;
    }

    const nextItems = target.items.filter((x) => x.id !== itemId);

    setRequests((prev) =>
      prev.map((r) =>
        r.req.id === reqId
          ? { ...r, items: nextItems }
          : r,
      ),
    );

    await syncRequestQuotedState(reqId, nextItems, target.req.status);
    toast.success("Item removed.");
  }

  function openReceiveFor(reqId: string, it: UiItem): void {
    const partId = (it.part_id ?? it.ui_part_id ?? null) as string | null;
    const part = partId
      ? parts.find((p) => String(p.id) === String(partId)) ?? null
      : null;

    const approved = n(
      (it as unknown as { qty_approved?: unknown }).qty_approved,
    );
    const received = n(
      (it as unknown as { qty_received?: unknown }).qty_received,
    );
    const remaining = Math.max(0, approved - received);

    setRecvItem({
      id: String(it.id),
      created_at: it.created_at ?? null,
      request_id: reqId,
      part_id: partId,
      description: String(it.description ?? ""),
      status: String((it as unknown as { status?: unknown }).status ?? ""),
      qty_approved: approved,
      qty_received: received,
      qty_remaining: remaining,
      part_name: part?.name ? String(part.name) : null,
      sku: part?.sku ? String(part.sku) : null,
      trust_level: partId ? trustByPartId[partId]?.level : undefined,
      trust_reasons: partId ? (trustByPartId[partId]?.reasons ?? []) : [],
    });
    setRecvOpen(true);
  }

  async function clearItemPoAssignment(item: UiItem): Promise<boolean> {
    const itemId = String(item.id);
    const hasPhysicalProgress = [
      item.qty_ordered,
      item.qty_received,
      item.qty_reserved,
      item.qty_consumed,
      item.qty_returned,
    ].some((value) => toNum(value, 0) > 0);
    if (hasPhysicalProgress) {
      toast.error("This item already has ordering or inventory activity. Cancel or move its PO line through the PO workflow.");
      return false;
    }

    setSavingItemId(itemId);
    try {
      const { data: updated, error } = await supabase
        .from("part_request_items")
        .update({ po_id: null })
        .eq("id", itemId)
        .select("id")
        .maybeSingle();

      if (error) {
        toast.error(error.message);
        return false;
      }
      if (!updated?.id) {
        toast.error("PO assignment could not be cleared.");
        return false;
      }

      setRequests((prev) =>
        prev.map((request) => ({
          ...request,
          items: request.items.map((candidate) =>
            String(candidate.id) === itemId
              ? { ...candidate, ui_po_id: "", po_id: null }
              : candidate,
          ),
        })),
      );
      return true;
    } finally {
      setSavingItemId(null);
    }
  }

  async function createPoLineForItem(item: UiItem, poId: string): Promise<boolean> {
    const itemId = String(item.id);
    if (!isUuid(poId)) {
      toast.error("Invalid PO id.");
      return false;
    }

    const parent = requests.find((request) => request.req.id === item.request_id);
    if (!parent || !isRequestOperationallyReleased(parent.req.status)) {
      toast.error("Pricing can be prepared now, but PO creation unlocks only after line approval.");
      return false;
    }

    const coverage = calculateOrderCoverage({
      qty: item.qty,
      qtyRequested: item.qty_requested,
      qtyApproved: item.qty_approved,
      qtyOrdered: item.qty_ordered,
      qtyReceived: item.qty_received,
      qtyReserved: item.qty_reserved,
      qtyConsumed: item.qty_consumed,
      qtyReturned: item.qty_returned,
    });
    if (coverage.targetQty <= 0) {
      toast.error("Enter an approved quantity before ordering this part.");
      return false;
    }
    if (coverage.remainingToOrderQty <= 0) {
      toast.info("This item is already covered by staged stock or existing PO quantity.");
      return true;
    }

    const rawUnitCost = Number(item.unit_cost);
    const unitCost = Number.isFinite(rawUnitCost) ? Math.max(rawUnitCost, 0) : null;
    const idempotencyKey = [
      "request-order",
      itemId,
      poId,
      `target-${coverage.targetQty}`,
      `shortage-${coverage.remainingToOrderQty}`,
    ].join(":");

    setSavingItemId(itemId);
    try {
      const response = await fetch(`/api/parts/requests/items/${itemId}/po-line`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          poId,
          qty: coverage.remainingToOrderQty,
          unitCost,
          locationId: item.location_id ?? defaultLocationId ?? null,
          idempotencyKey,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        result?: {
          ordered_qty?: number;
          remaining_to_order?: number;
          status?: string;
        };
      } | null;
      if (!response.ok || !body?.ok) {
        toast.error(body?.error || "Could not add this approved item to the purchase order.");
        return false;
      }

      setRequests((prev) =>
        prev.map((request) => ({
          ...request,
          items: request.items.map((candidate) =>
            String(candidate.id) === itemId
              ? ({
                  ...candidate,
                  po_id: poId,
                  ui_po_id: poId,
                  qty_ordered: body.result?.ordered_qty ?? candidate.qty_ordered,
                  status: (body.result?.status ?? candidate.status) as ItemRow["status"],
                } as UiItem)
              : candidate,
          ),
        })),
      );
      toast.success(
        body.result?.remaining_to_order
          ? `${coverage.remainingToOrderQty} added to the PO; ${body.result.remaining_to_order} still needs ordering.`
          : `${coverage.remainingToOrderQty} added to the purchase order.`,
      );
      return true;
    } finally {
      setSavingItemId(null);
    }
  }

  async function ensureSupplierExists(
    shopId: string,
    supplierName: string,
  ): Promise<string | null> {
    const name = normalizeName(supplierName);
    if (!name) return null;

    // Try exact match
    const { data: existing } = await supabase
      .from("suppliers")
      .select("id, name")
      .eq("shop_id", shopId)
      .ilike("name", name)
      .maybeSingle();

    if (existing?.id) return String(existing.id);

    // Create (accept new entry)
    const { data: created, error: cErr } = await supabase
      .from("suppliers")
      .insert(
        {
          shop_id: shopId,
          name,
        } as unknown as DB["public"]["Tables"]["suppliers"]["Insert"],
      )
      .select("id")
      .single();

    if (cErr) {
      toast.error(cErr.message);
      return null;
    }

    return created?.id ? String(created.id) : null;
  }

  async function createPoForSupplier(
    shopId: string,
    supplierId: string | null,
    notes?: string,
  ): Promise<string | null> {
    const insert = {
      shop_id: shopId,
      supplier_id: supplierId,
      status: "open",
      notes: notes?.trim() ? notes.trim() : null,
    };

    const { data, error } = await supabase
      .from("purchase_orders")
      .insert(
        insert as unknown as DB["public"]["Tables"]["purchase_orders"]["Insert"],
      )
      .select("*")
      .single();

    if (error) {
      toast.error(error.message);
      return null;
    }

    const id = data?.id ? String(data.id) : null;
    if (!id) return null;

    // refresh local PO list (no extra routes)
    setPOs((prev) => [data as PurchaseOrderRow, ...prev]);
    return id;
  }

  async function createOrReusePoAndAssign(
    item: UiItem,
    supplierId: string,
    reuseExistingPoId?: string | null,
  ): Promise<void> {
    if (!wo?.shop_id) {
      toast.error("Missing shop_id.");
      return;
    }

    const shopId = String(wo.shop_id);
    const sid = String(supplierId);

    // Rule: one PO per vendor (per work order) => reuse if one already exists
    const existingForVendor = pos.find(
      (p) =>
        String(p.supplier_id ?? "") === sid &&
        String(p.status ?? "open").toLowerCase() !== "received",
    );

    const useId = reuseExistingPoId?.trim()
      ? reuseExistingPoId.trim()
      : existingForVendor?.id
        ? String(existingForVendor.id)
        : null;

    if (useId && !isUuid(useId)) {
      toast.error("Invalid PO id.");
      return;
    }

    const poId =
      useId ??
      (await createPoForSupplier(
        shopId,
        sid,
        `Auto-created from request ${String(item.request_id ?? "").slice(0, 8)}`,
      ));
    if (!poId) return;

    await createPoLineForItem(item, poId);
  }


  async function syncQuoteLineForItem(itemId: string): Promise<void> {
    if (!isUuid(itemId)) return;
    try {
      const res = await fetch(`/api/parts/requests/items/${itemId}/quote-line-sync`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.warning(body?.error || "Quote line parts status sync skipped.");
      }
    } catch {
      toast.warning("Quote line parts status sync skipped.");
    }
  }


  async function savePreApprovalQuote(reqId: string, itemId: string): Promise<void> {
    const target = requests.find((r) => r.req.id === reqId);
    const it = target?.items.find((x) => String(x.id) === String(itemId));
    if (!target || !it) return;

    const quoteLineId = it.quote_line_id ?? target.req.quote_line_id ?? null;
    if (!quoteLineId) {
      toast.error("This item is not linked to a quote line.");
      return;
    }
    if (isUuid(it.work_order_line_id)) {
      toast.error("This item is already linked to a work order line. Use the normal allocation flow.");
      return;
    }

    const normalizedStatus = String(it.status ?? "").toLowerCase();
    if (["cancelled", "rejected", "declined"].includes(normalizedStatus)) {
      toast.error("Cancelled or rejected items cannot be quoted.");
      return;
    }

    const qty = Math.max(1, Math.floor(toNum(it.ui_qty, 1)));
    const price = it.ui_price;
    if (price == null || !Number.isFinite(price) || price < 0) {
      toast.error("Enter a quoted unit price of 0 or greater.");
      return;
    }

    const resolved = resolveAddPartId(it);
    const partId = resolved.partId;
    if (!partId) {
      toast.error(resolved.error ?? "Pick a stock part first.");
      return;
    }
    if (partId && !isUuid(partId)) {
      toast.error("Invalid part id (must be a UUID).");
      return;
    }
    const conflict = detectPartDescriptionConflict({
      requestedDescription: it.description,
      requestedPartNumber: it.requested_part_number,
      matchedPart: getPartForConflict(partId),
    });
    if (conflict && !conflictOverrideByItemId[itemId]) {
      setConflictWarningByItemId((prev) => ({ ...prev, [itemId]: conflict.message }));
      toast.warning("Possible mismatch. Review the warning before saving.");
      return;
    }

    const vendorId = String(it.ui_supplier_id ?? "").trim();
    const validVendorId = vendorId && !vendorId.startsWith("__new__:") ? vendorId : null;
    if (validVendorId && !isUuid(validVendorId)) {
      toast.error("Invalid supplier id (must be a UUID).");
      return;
    }

    setSavingItemId(itemId);
    try {
      const res = await fetch(`/api/parts/requests/items/${itemId}/quote-save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteLineId: quoteLineId!,
          description: String(it.description ?? "").trim(),
          qty,
          quotedPrice: price,
          partId,
          vendorId: validVendorId,
          requestedPartNumber: String(it.requested_part_number ?? "").trim() || null,
          requestedManufacturer: String(it.requested_manufacturer ?? "").trim() || null,
        }),
      });

      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; notice?: string; item?: ItemRow }
        | null;

      if (!res.ok || !body?.ok || !body.item) {
        toast.error(body?.error || "Could not save quote.");
        return;
      }

      const updated = body.item;
      const nextItems = target.items.map((x) =>
        String(x.id) === String(itemId)
          ? ({
              ...x,
              ...updated,
              ui_part_id: updated.part_id ?? partId ?? null,
              ui_qty: toNum(updated.qty, qty),
              ui_price:
                updated.quoted_price == null
                  ? price
                  : toNum(updated.quoted_price, price),
              ui_supplier_id: updated.vendor_id ?? validVendorId ?? x.ui_supplier_id,
            } as UiItem)
          : x,
      );

      setRequests((prev) =>
        prev.map((r) =>
          r.req.id === reqId
            ? {
                ...r,
                items: r.items.map((x) =>
                  String(x.id) === String(itemId)
                    ? ({
                        ...x,
                        ...updated,
                        ui_part_id: updated.part_id ?? partId ?? null,
                        ui_qty: toNum(updated.qty, qty),
                        ui_price:
                          updated.quoted_price == null
                            ? price
                            : toNum(updated.quoted_price, price),
                        ui_supplier_id: updated.vendor_id ?? validVendorId ?? x.ui_supplier_id,
                      } as UiItem)
                    : x,
                ),
              }
            : r,
        ),
      );

      await syncRequestQuotedState(reqId, nextItems, target.req.status);
      window.dispatchEvent(new Event("parts-request:submitted"));
      toast.success(body.notice || "Quote saved. Allocation will unlock after customer approval.");
      setConflictWarningByItemId((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
      setConflictOverrideByItemId((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
    } finally {
      setSavingItemId(null);
    }
  }

  async function addAndAttach(
    reqId: string,
    itemId: string,
    overrides?: {
      partId?: string | null;
      qty?: number | null;
      sellPrice?: number | null;
      description?: string | null;
      requestedPartNumber?: string | null;
      requestedManufacturer?: string | null;
    },
  ): Promise<void> {
    const target = requests.find((r) => r.req.id === reqId);
    const baseItem = target?.items.find((x) => String(x.id) === String(itemId));
    if (!target || !baseItem) return;

    const it = {
      ...baseItem,
      part_id: overrides?.partId ?? baseItem.part_id,
      ui_part_id: overrides?.partId ?? baseItem.ui_part_id,
      qty: overrides?.qty ?? baseItem.qty,
      ui_qty: overrides?.qty ?? baseItem.ui_qty,
      quoted_price: overrides?.sellPrice ?? baseItem.quoted_price,
      ui_price: overrides?.sellPrice ?? baseItem.ui_price,
      description: overrides?.description ?? baseItem.description,
      requested_part_number: overrides?.requestedPartNumber ?? baseItem.requested_part_number,
      requested_manufacturer: overrides?.requestedManufacturer ?? baseItem.requested_manufacturer,
    } as UiItem;

    const resolved = resolveAddPartId(it);
    const partId = resolved.partId;
    const qty = toNum(it.ui_qty, 0);
    const price = it.ui_price;

    if (!partId) {
      toast.error(resolved.error ?? "Pick a stock part first.");
      return;
    }
    if (!isUuid(partId)) {
      toast.error("Invalid part id (must be a UUID).");
      return;
    }
    if (!qty || qty <= 0) {
      toast.error("Enter a quantity greater than 0.");
      return;
    }
    if (price == null || !Number.isFinite(price)) {
      toast.error("Price is missing.");
      return;
    }
    if (price < 0) {
      toast.error("Enter a quoted unit price of 0 or greater.");
      return;
    }

    const conflict = detectPartDescriptionConflict({
      requestedDescription: it.description,
      requestedPartNumber: it.requested_part_number,
      matchedPart: getPartForConflict(partId),
    });
    if (conflict && !conflictOverrideByItemId[itemId]) {
      setConflictWarningByItemId((prev) => ({ ...prev, [itemId]: conflict.message }));
      return;
    }

    const lineId = getEffectiveWorkOrderLineId(target.req, target.items);
    const durableLineId = resolveWorkOrderLineId(target.req, target.items);
    const isPreApprovalQuoteItem =
      Boolean(it.quote_line_id ?? target.req.quote_line_id) && !durableLineId;
    if (isPreApprovalQuoteItem) {
      toast.error("Quote-originated parts can be priced before approval. Ordering and stock allocation unlock automatically after approval.");
      return;
    }

    if (!isRequestOperationallyReleased(target.req.status)) {
      toast.error("Pricing can be saved now, but ordering and work-order attachment unlock only after line approval.");
      return;
    }

    if (!lineId || !isUuid(lineId)) {
      toast.error("This request has no durable repair-line link. Reload it from the originating work-order line before attaching parts.");
      return;
    }

    const locId = defaultLocationId || "";

    setSavingReqId(reqId);
    try {
      const part = parts.find((p) => String(p.id) === String(partId));
      const desc = (part?.name ?? it.description ?? "").trim();

      const poId = it.ui_po_id?.trim() ? it.ui_po_id.trim() : null;
      if (poId && !isUuid(poId)) {
        toast.error("Invalid PO id (must be a UUID).");
        return;
      }
      const supplierId = String(it.ui_supplier_id ?? "").trim();
      const validSupplierId = supplierId && !supplierId.startsWith("__new__:") ? supplierId : null;
      if (validSupplierId && !isUuid(validSupplierId)) {
        toast.error("Invalid supplier id (must be a UUID).");
        return;
      }

      // ✅ work_order_line_id must be UUID (avoid passing legacy strings)
      const safeLineId = isUuid(it.work_order_line_id)
        ? it.work_order_line_id
        : lineId;

      const selectedStockAvailable = stockAvailableByPartId[String(partId)] ?? 0;
      const allocationQty = locId
        ? Math.min(qty, Math.max(selectedStockAvailable, 0))
        : 0;
      const shouldAllocateFromStock = allocationQty >= qty;
      const hasPartialStock = allocationQty > 0 && allocationQty < qty;
      if (locId && selectedStockAvailable <= 0) {
        toast.warning("No available stock for the selected part. The item will be saved without blocking allocation/order follow-up.");
      } else if (hasPartialStock) {
        toast.info(`${allocationQty} can be reserved now; the remaining ${qty - allocationQty} still needs ordering.`);
      }

      const attachIdempotencyKey = [
        "attach-request-item",
        itemId,
        partId,
        safeLineId,
        qty,
        price,
      ].join(":");

      const res = await fetch(`/api/parts/requests/items/${itemId}/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partId,
          description: desc || it.description || "Part",
          qty,
          quotedPrice: price,
          requestedPartNumber: String(it.requested_part_number ?? "").trim() || null,
          requestedManufacturer: String(it.requested_manufacturer ?? "").trim() || null,
          workOrderLineId: safeLineId,
          poId,
          locationId: shouldAllocateFromStock ? locId : null,
          createAllocation: shouldAllocateFromStock,
          warningAccepted: Boolean(conflictOverrideByItemId[itemId]),
          warningReason: conflictOverrideByItemId[itemId] ? conflict?.message ?? null : null,
          idempotencyKey: attachIdempotencyKey,
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; item?: ItemRow }
        | null;

      if (!res.ok || !body?.ok || !body.item) {
        toast.error(
          body?.error ||
            "Could not add this part. The update may have been blocked by shop access.",
        );
        return;
      }

      if (!locId) {
        toast.warning(
          "No stock location exists for this shop. Item saved, but inventory was not allocated.",
        );
      }

      const updated = body.item;

      if (hasPartialStock && locId) {
        const allocationResponse = await fetch(
          `/api/parts/requests/items/${itemId}/allocate`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              locationId: locId,
              qty: allocationQty,
              idempotencyKey: [
                "attach-partial-stock",
                itemId,
                partId,
                locId,
                allocationQty,
                qty,
              ].join(":"),
            }),
          },
        );
        const allocationBody = (await allocationResponse.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
        } | null;
        if (!allocationResponse.ok || !allocationBody?.ok) {
          toast.warning(
            allocationBody?.error ||
              "The part was saved, but the available partial stock could not be reserved.",
          );
        } else {
          toast.success(`${allocationQty} reserved from stock; ${qty - allocationQty} remains to order.`);
        }
      }

      const nextItems = target.items.map((x) => {
        if (x.id !== itemId) return x;
        return {
          ...x,
          ...updated,
          ui_part_id: updated.part_id ?? partId,
          ui_qty: toNum(updated.qty, qty),
          ui_price:
            updated.quoted_price == null
              ? price
              : toNum(updated.quoted_price, price),
          ui_added: true,
          ui_po_id: updated.po_id ?? poId ?? "",
        } as UiItem;
      });

      const allNowQuoted =
        nextItems.length > 0 && nextItems.every((x) => isRowComplete(x));
      const mayReconcileQuoteStatus = ["requested", "quoted"].includes(
        String(target.req.status ?? "").toLowerCase(),
      );

      setRequests((prev) =>
        prev.map((r) =>
          r.req.id !== reqId
            ? r
            : {
                req: {
                  ...r.req,
                  status:
                    allNowQuoted && mayReconcileQuoteStatus
                      ? "quoted"
                      : r.req.status,
                },
                items: r.items.map((x) =>
                  x.id !== itemId
                    ? x
                    : ({
                        ...x,
                        ...updated,
                        ui_part_id: updated.part_id ?? partId,
                        ui_qty: toNum(updated.qty, qty),
                        ui_price:
                          updated.quoted_price == null
                            ? price
                            : toNum(updated.quoted_price, price),
                        ui_added: true,
                        ui_po_id: updated.po_id ?? poId ?? "",
                      } as UiItem),
                ),
              },
        ),
      );

      await syncRequestQuotedState(reqId, nextItems, target.req.status);

      if (it.quote_line_id) {
        await syncQuoteLineForItem(String(it.id));
      }

      window.dispatchEvent(new Event("parts-request:submitted"));
      window.dispatchEvent(new Event("wo:parts-used"));

      // Reusable menu learning intentionally does not run from staged parts-package saves.


      setAddedToWorkOrderByItemId((prev) => ({ ...prev, [itemId]: true }));
      toast.success("Part saved to work order.");
      setConflictWarningByItemId((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
      setConflictOverrideByItemId((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
    } finally {
      setSavingReqId(null);
    }
  }

  async function commitPartsPackage(requestId: string): Promise<void> {
    const request = requests.find((candidate) => candidate.req.id === requestId);
    if (!request || !isRequestOperationallyReleased(request.req.status)) {
      toast.error("Save the quote and wait for line approval. The parts package will unlock automatically after approval.");
      return;
    }

    setSavingReqId(requestId);
    try {
      const packageFingerprint = (request?.items ?? [])
        .slice()
        .sort((a, b) => String(a.id).localeCompare(String(b.id)))
        .map((item) =>
          [
            item.id,
            item.part_id ?? "",
            item.work_order_line_id ?? "",
            item.qty ?? "",
            item.quoted_price ?? "",
          ].join(":"),
        )
        .join("|");
      const idempotencyKey = `parts-package:${requestId}:${packageFingerprint}`;
      const res = await fetch(`/api/parts/requests/${requestId}/commit-package`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idempotencyKey }),
      });
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        committedCount?: number;
        skippedCount?: number;
        errorsRequiringReview?: Array<{ itemId?: string; reason?: string; error?: string }>;
        results?: Array<{ itemId?: string; status?: string; workOrderPartId?: string }>;
        error?: string;
      } | null;

      if (!res.ok || !body) {
        toast.error(body?.error || "Could not save parts package to work order.");
        return;
      }

      const review = body.errorsRequiringReview ?? [];
      if (!body.ok || review.length > 0) {
        setPackageCommitWarningByItemId(Object.fromEntries(
          review.flatMap((item) => {
            const itemId = item.itemId ? String(item.itemId) : "";
            const reason = item.reason ?? item.error ?? "Review this item before saving it to the work order.";
            return itemId ? [[itemId, reason] as const] : [];
          }),
        ));
        toast.warning(`Parts package needs review: ${review.length} item${review.length === 1 ? "" : "s"} not saved.`);
      } else {
        setPackageCommitWarningByItemId({});
        // Success is shown after canonical refresh below so a refresh failure only emits one warning.
      }

      setAddedToWorkOrderByItemId((prev) => {
        const next = { ...prev };
        for (const result of body.results ?? []) {
          if (result.itemId && (result.status === "committed" || result.status === "already_committed")) {
            next[result.itemId] = true;
          }
        }
        return next;
      });

      window.dispatchEvent(new Event("parts-request:submitted"));
      window.dispatchEvent(new Event("wo:parts-used"));
      try {
        await load({ preserveContent: true });
        if (body.ok && review.length === 0) {
          toast.success(`Parts package saved to work order (${body.committedCount ?? 0} item${body.committedCount === 1 ? "" : "s"}).`);
        }
      } catch (error) {
        toast.warning(error instanceof Error ? `Parts package saved, but refresh failed: ${error.message}` : "Parts package saved, but refresh failed.");
      }
    } finally {
      setSavingReqId(null);
    }
  }

  const woDisplay = wo?.custom_id || (wo?.id ? `#${wo.id.slice(0, 8)}` : null);

  const locOptions: Opt[] = locations.map((l) => ({
    value: String(l.id),
    label: `${String(l.code ?? "LOC")} — ${String(l.name ?? "")}`,
  }));

  const poOptions: Opt[] = pos.map((po) => ({
    value: String(po.id),
    label:
      poLabelById.get(String(po.id)) ??
      `${String(po.id).slice(0, 8)} • ${String(po.status ?? "open")}`,
  }));

  const resolvedDefaultLocId = defaultLocationId || locOptions[0]?.value || "";

  // Supplier options (for quick-create per item)
  const supplierOptions: Opt[] = suppliers.map((s) => ({
    value: String(s.id),
    label: String(s.name ?? String(s.id).slice(0, 8)),
  }));

  const requestSummary = useMemo(() => {
    let waiting = 0;
    let ordered = 0;
    let partiallyReceived = 0;
    let complete = 0;
    for (const r of requests) {
      const requestState = toRequestFlowDisplay({
        rawStatus: r.req.status,
        itemStates: r.items.map((it) =>
          toItemFlowDisplay({
            rawStatus: (it as { status?: string | null }).status,
            qty: it.qty,
            qtyApproved: (it as { qty_approved?: unknown }).qty_approved,
            qtyReceived: (it as { qty_received?: unknown }).qty_received,
          }),
        ),
      });
      if (requestState === "pending") waiting += 1;
      else if (requestState === "in_progress") ordered += 1;
      else if (requestState === "ready") partiallyReceived += 1;
      else complete += 1;
    }
    return { waiting, ordered, partiallyReceived, complete };
  }, [requests]);

  return (
    <div className={pageWrap}>
      <div className="sticky top-2 z-20 flex items-center justify-between gap-3 rounded-2xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-panel-bg-soft)]/90 px-3 py-2 backdrop-blur">
        <button className={btnGhost} onClick={() => router.back()} type="button">
          ← Back
        </button>
        {woDisplay ? (
          <div className="text-xs uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
            Work order <span className="text-[color:var(--theme-text-primary)]">{woDisplay}</span>
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className={`${glassCard} p-4 text-[color:var(--theme-text-secondary)]`}>Loading…</div>
      ) : !wo ? (
        <div className={`${glassCard} p-4 text-[color:var(--theme-text-secondary)]`}>
          Work order not found / not visible.
        </div>
      ) : (
        <>
          <RequestHeaderSection
            title={
              <>
                Work Order <span className={ACCENT_TEXT}>{woDisplay}</span>
              </>
            }
            subtitle="Parts requests for this work order."
            selectedPo={selectedPo}
            poOptions={poOptions}
            onSelectedPoChange={setSelectedPo}
            statusSummary={
              <RequestStatusSummary
                waiting={requestSummary.waiting}
                ordered={requestSummary.ordered}
                partiallyReceived={requestSummary.partiallyReceived}
                complete={requestSummary.complete}
              />
            }
          />

          {requests.length === 0 ? (
            <div className={`${glassCard} p-4 text-[color:var(--theme-text-secondary)]`}>
              No parts requests for this work order yet.
            </div>
          ) : (
            <div className="space-y-4">
              {requests.map((r) => {
                const busy = savingReqId === r.req.id;
                const requestState = toRequestFlowDisplay({
                  rawStatus: r.req.status,
                  itemStates: r.items.map((it) =>
                    toItemFlowDisplay({
                      rawStatus: (it as { status?: string | null }).status,
                      qty: it.qty,
                      qtyApproved: (it as { qty_approved?: unknown }).qty_approved,
                      qtyReceived: (it as { qty_received?: unknown }).qty_received,
                    }),
                  ),
                });

                const linkedLineId = resolveWorkOrderLineId(r.req, r.items);
                const quoteLineId = r.req.quote_line_id ?? null;
                const hasQuoteLineOrigin = !!quoteLineId;
                const lineId = getEffectiveWorkOrderLineId(r.req, r.items);
                const hasValidLineId = !!lineId && isUuid(lineId);
                const canMaterializeToLine = hasValidLineId && (!hasQuoteLineOrigin || !!linkedLineId);
                const isFallbackLinked =
                  !linkedLineId && !!lineId && isUuid(lineId);
                const jobText =
                  hasValidLineId
                    ? lineLabelFrom(lineById.get(lineId))
                    : "";

                if (PARTS_REQUEST_WORKBENCH_V2_LOCAL_FLAG || searchParams.get("workbenchV2") !== "0") {
                  const model = mapRequestToWorkbenchModel({
                    request: r.req as unknown as Record<string, unknown>,
                    items: r.items as unknown as Record<string, unknown>[],
                    supplierOptions,
                    poOptions,
                    locationOptions: locOptions,
                    parts: parts as unknown as Record<string, unknown>[],
                    stockAvailableByPartId,
                    workOrderId: wo?.id ?? r.req.work_order_id ?? null,
                    workOrderCustomId: woDisplay,
                    jobContext: jobText,
                    defaultLocationId: resolvedDefaultLocId,
                    defaultSupplierId: "",
                    stockSuggestionCountByItemId: Object.fromEntries(
                      r.items.map((item) => [
                        String(item.id),
                        stockSuggestionsByItemId[String(item.id)]?.length ?? 0,
                      ]),
                    ),
                    supplierSuggestionCountByItemId: Object.fromEntries(
                      r.items.map((item) => [
                        String(item.id),
                        supplierSuggestionsByItemId[String(item.id)]?.length ?? 0,
                      ]),
                    ),
                    conflictWarningByItemId,
                    addedToWorkOrderByItemId,
                    packageCommitWarningByItemId,
                  });

                  return (
                    <div key={r.req.id} className={glassCard}>
                      <PartsRequestWorkbench
                        model={model}
                        onSaveItem={async (input: SaveItemInput) => {
                          const qty = Number(input.qty);
                          const sellPrice = input.sellPrice == null ? null : Number(input.sellPrice);

                          if (!Number.isFinite(qty) || qty <= 0) {
                            toast.error("Qty must be greater than zero.");
                            return;
                          }

                          if (sellPrice != null && (!Number.isFinite(sellPrice) || sellPrice < 0)) {
                            toast.error("Sell price must be zero or greater.");
                            return;
                          }

                          const existingItem = r.items.find((candidate) => String(candidate.id) === String(input.itemId));
                          if (
                            existingItem &&
                            (existingItem.description !== input.description ||
                              (existingItem.requested_part_number ?? "") !== (input.requestedPartNumber ?? ""))
                          ) {
                            clearConflictOverride(input.itemId);
                          }

                          updateItem(r.req.id, input.itemId, {
                            description: input.description,
                            requested_part_number: input.requestedPartNumber ?? null,
                            requested_manufacturer: input.requestedManufacturer ?? null,
                            qty,
                            ui_qty: qty,
                            quoted_price: sellPrice,
                            ui_price: sellPrice ?? undefined,
                          });

                          console.info("[parts-request-v2:save-row]", {
                            requestId: r.req.id,
                            itemId: input.itemId,
                            qty,
                            sellPrice,
                          });

                          try {
                            await persistItemFields(input.itemId, {
                              description: input.description,
                              requested_part_number: input.requestedPartNumber ?? null,
                              requested_manufacturer: input.requestedManufacturer ?? null,
                              qty,
                              quoted_price: sellPrice,
                            });
                            await load({ preserveContent: true });
                            toast.success("Part request row saved.");
                          } catch (error) {
                            toast.error(error instanceof Error ? error.message : "Could not save part request row.");
                          }
                        }}
                        onAttachInventory={async (input) => {
                          const selectedPart = parts.find((part) => String(part.id) === String(input.partId)) ?? null;
                          const selectedRecord = selectedPart as unknown as Record<string, unknown> | null;

                          clearConflictOverride(input.itemId);

                          const existingItem = r.items.find((candidate) => String(candidate.id) === String(input.itemId));
                          const conflict = detectPartDescriptionConflict({
                            requestedDescription: existingItem?.description,
                            requestedPartNumber: existingItem?.requested_part_number,
                            requestedManufacturer: existingItem?.requested_manufacturer,
                            matchedPart: selectedPart,
                          });

                          if (conflict && !input.warningAccepted) {
                            setConflictWarningByItemId((prev) => ({ ...prev, [input.itemId]: conflict.message }));
                            toast.warning("Possible mismatch. Review the selected inventory part before attaching.");
                            throw new Error(conflict.message);
                          }

                          const res = await fetch(`/api/parts/requests/items/${input.itemId}/inventory`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ mode: "attach", partId: input.partId }),
                          });
                          const body = await res.json().catch(() => null) as { ok?: boolean; error?: string; item?: ItemRow } | null;
                          if (!res.ok || !body?.ok) {
                            const message = body?.error || "Could not attach inventory part.";
                            toast.error(message);
                            throw new Error(message);
                          }

                          if (body.item) {
                            updateItem(r.req.id, input.itemId, {
                              ...body.item,
                              ui_part_id: body.item.part_id ?? input.partId,
                              ui_price:
                                typeof selectedRecord?.price === "number"
                                  ? selectedRecord.price
                                  : selectedRecord?.price == null
                                    ? undefined
                                    : Number(selectedRecord.price),
                              ui_added: false,
                            } as Partial<UiItem>);
                          }
                          setAddedToWorkOrderByItemId((prev) => {
                            const next = { ...prev };
                            delete next[input.itemId];
                            return next;
                          });
                          toast.success("Inventory part selected.");
                          return body.item
                            ? {
                                partId: body.item.part_id ?? input.partId,
                                description: body.item.description ?? existingItem?.description ?? "Part",
                                requestedPartNumber: body.item.requested_part_number ?? null,
                                requestedManufacturer: body.item.requested_manufacturer ?? null,
                                qty: toNum(body.item.qty, existingItem?.ui_qty ?? 1),
                                sellPrice: body.item.quoted_price == null ? null : toNum(body.item.quoted_price, 0),
                                status: body.item.status ?? null,
                                poId: ((body.item as unknown) as { po_id?: string | null }).po_id ?? null,
                                qtyReceived: toNum(((body.item as unknown) as { qty_received?: unknown }).qty_received, 0),
                                qtyApproved: toNum(((body.item as unknown) as { qty_approved?: unknown }).qty_approved, 0),
                                addedToWorkOrder: false,
                              }
                            : { partId: input.partId, addedToWorkOrder: false };
                        }}
                        onCreateInventoryItem={async (itemId, input) => {
                          const res = await fetch(`/api/parts/requests/items/${itemId}/inventory`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              mode: "create",
                              name: input.name,
                              partNumber: input.partNumber,
                              manufacturer: input.manufacturer,
                              sku: input.sku,
                              category: input.category,
                              sellPrice: input.sellPrice,
                              initialQty: input.initialQty,
                              locationId: resolvedDefaultLocId || defaultLocationId || null,
                            }),
                          });
                          const body = await res.json().catch(() => null) as { ok?: boolean; error?: string; item?: ItemRow } | null;
                          if (!res.ok || !body?.ok) {
                            toast.error(body?.error || "Could not create inventory item.");
                            return;
                          }
                          toast.success("Inventory item created and attached.");
                          await load();
                        }}
                        onCommitPackage={() => {
                          void commitPartsPackage(r.req.id);
                        }}
                        onSubmitOrder={async (itemId, input) => {
                          updateItem(r.req.id, itemId, {
                            ui_supplier_id: input.supplierId,
                            ui_po_id: input.poMode === "existing" ? input.existingPoId : "",
                          });
                          const item = r.items.find((candidate) => String(candidate.id) === String(itemId));
                          if (!item) {
                            toast.error("Request item not found.");
                            return;
                          }
                          await createOrReusePoAndAssign(
                            item,
                            input.supplierId,
                            input.poMode === "existing" ? input.existingPoId : null,
                          );
                          await load();
                        }}
                        onOpenReceiveDrawer={async (itemId) => {
                          const item = r.items.find((candidate) => String(candidate.id) === String(itemId));
                          if (item) openReceiveFor(r.req.id, item);
                        }}
                        onClearMatch={async (itemId) => {
                          clearConflictOverride(itemId);
                          updateItem(r.req.id, itemId, { ui_part_id: null });
                        }}
                        onConfirmConflict={(itemId) => {
                          confirmConflictOverride(itemId);
                        }}
                        onResetConflictOverride={(itemId) => {
                          clearConflictOverride(itemId);
                        }}
                        onDeleteItem={async (itemId) => {
                          await deleteLine(r.req.id, itemId);
                        }}
                      />
                    </div>
                  );
                }

                return (
                  <div key={r.req.id} className={`${glassCard} overflow-hidden`}>
                    <div className={`${glassHeader} px-4 py-3`}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold">
                            Request{" "}
                            <span className={ACCENT_TEXT}>
                              #{r.req.id.slice(0, 8)}
                            </span>
                          </div>

                          <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                            Created{" "}
                            {r.req.created_at
                              ? new Date(r.req.created_at).toLocaleString()
                              : "—"}
                            <span className="mx-2 text-[color:var(--theme-text-muted)]">·</span>
                            Line: {hasValidLineId && lineId ? String(lineId).slice(0, 8) : "Not linked"}
                            {hasQuoteLineOrigin ? (
                              <>
                                <span className="mx-2 text-[color:var(--theme-text-muted)]">·</span>
                                Quote line: {quoteLineId ? String(quoteLineId).slice(0, 8) : "—"}
                              </>
                            ) : null}
                          </div>

                          {jobText ? (
                            <div className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
                              Job:{" "}
                              <span className="text-[color:var(--theme-text-secondary)]">{jobText}</span>
                              {isFallbackLinked ? (
                                <span className="ml-2 text-[rgba(242,210,187,0.94)]">
                                  (using only work order line)
                                </span>
                              ) : null}
                            </div>
                          ) : !hasValidLineId ? (
                            <div className="mt-1 text-xs text-[rgba(242,210,187,0.94)]">
                              {hasQuoteLineOrigin
                                ? "Quote-originated request: work order line linkage is deferred until approval."
                                : "This request is not linked to a valid work order line yet."}
                            </div>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={
                              requestState === "pending"
                                ? pillNeedsQuote
                                : requestState === "in_progress"
                                  ? pillProgress
                                  : requestState === "ready"
                                    ? pillQuoted
                                    : pillComplete
                            }
                          >
                            {requestFlowLabel(requestState)}
                          </span>

                          <button
                            className={btnGhost}
                            onClick={() => void addRow(r.req.id)}
                            disabled={busy}
                            title={!hasValidLineId && !hasQuoteLineOrigin ? "Missing work order line link" : undefined}
                            type="button"
                          >
                            {busy ? "Working…" : "＋ Add part row"}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 p-3">
                      <div className="grid gap-2 rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-2 text-xs text-[color:var(--theme-text-secondary)] md:grid-cols-3">
                        <div>
                          Request state:{" "}
                          <span className="font-semibold text-[color:var(--theme-text-primary)]">
                            {requestFlowLabel(requestState)}
                          </span>
                        </div>
                        <div>
                          Items:{" "}
                          <span className="font-semibold text-[color:var(--theme-text-primary)]">{r.items.length}</span>
                        </div>
                        <div>
                          Linked line:{" "}
                          <span className="font-semibold text-[color:var(--theme-text-primary)]">
                            {hasValidLineId ? lineId?.slice(0, 8) : "Not linked"}
                          </span>
                        </div>
                      </div>
                      <RequestItemsTable>
                        <table className="w-full text-sm">
                          <thead className="bg-[color:var(--desktop-item-bg)] text-[color:var(--theme-text-secondary)]">
                            <tr>
                              <th className="px-3 py-2 text-left">Requested part / catalog</th>
                              <th className="px-3 py-2 text-right">Qty</th>
                              <th className="px-3 py-2 text-right">Price (unit)</th>
                              <th className="px-3 py-2 text-left">PO</th>
                              <th className="px-3 py-2 text-right">Line total</th>
                              <th className="w-[220px] px-3 py-2" />
                            </tr>
                          </thead>

                          <tbody>
                            {r.items.length === 0 ? (
                              <tr className="border-t border-[color:var(--desktop-border)]">
                                <td
                                  className="p-4 text-sm text-[color:var(--theme-text-muted)]"
                                  colSpan={6}
                                >
                                  No items yet. Click “Add part row”.
                                </td>
                              </tr>
                            ) : (
                              r.items.map((it) => {
                                const rowBusy =
                                  busy || savingItemId === String(it.id);

                                const qty = toNum(it.ui_qty, 0);
                                const price = it.ui_price ?? 0;
                                const lineTotal = qty > 0 ? price * qty : 0;

                                const approved = n(
                                  (it as unknown as { qty_approved?: unknown })
                                    .qty_approved,
                                );
                                const received = n(
                                  (it as unknown as { qty_received?: unknown })
                                    .qty_received,
                                );
                                const remaining = Math.max(0, approved - received);

                                const effectivePartId = (it.part_id ??
                                  it.ui_part_id ??
                                  null) as string | null;
                                const trustMeta = effectivePartId ? trustByPartId[effectivePartId] : null;
                                const stockSuggestions = stockSuggestionsByItemId[String(it.id)] ?? [];
                                const supplierSuggestions = supplierSuggestionsByItemId[String(it.id)] ?? [];
                                const supplierSuggestion = supplierSuggestions[0] ?? null;
                                const supplierSuggestionApplied = !!supplierSuggestionAppliedByItemId[String(it.id)];
                                const conflictWarning = conflictWarningByItemId[String(it.id)] ?? null;
                                const topSuggestion = stockSuggestions[0] ?? null;
                                const hasAttachedPart = isUuid(it.part_id);
                                const showSuggestion = !!topSuggestion && !hasAttachedPart;
                                const suggestionDisplay = topSuggestion ? getStockSuggestionDisplay(topSuggestion) : null;
                                const requestedPartNumber = String(it.requested_part_number ?? "").trim();
                                const canCreateInventory = !hasAttachedPart && requestedPartNumber.length > 0 && (!topSuggestion || topSuggestion.confidence === "low");
                                const canReceive =
                                  !!effectivePartId &&
                                  approved > 0 &&
                                  remaining > 0 &&
                                  !!resolvedDefaultLocId;

                                const uiPoId = (it.ui_po_id ?? "").trim();
                                const poLabel = uiPoId
                                  ? poLabelById.get(uiPoId) ?? uiPoId.slice(0, 8)
                                  : "";
                                const itemState = toItemFlowDisplay({
                                  rawStatus: (it as { status?: string | null }).status,
                                  qty: it.qty,
                                  qtyApproved: (it as { qty_approved?: unknown }).qty_approved,
                                  qtyReceived: (it as { qty_received?: unknown }).qty_received,
                                });
                                const itemHasQuoteLineOrigin = !!it.quote_line_id || hasQuoteLineOrigin;
                                const isQuoteOnlyPreApprovalItem =
                                  itemHasQuoteLineOrigin && !isUuid(it.work_order_line_id);
                                const quoteSaveDisabled =
                                  rowBusy ||
                                  it.ui_price == null ||
                                  !Number.isFinite(it.ui_price) ||
                                  it.ui_price < 0;

                                return (
                                  <tr
                                    key={String(it.id)}
                                    className="border-t border-[color:var(--desktop-border)]"
                                  >
                                    {/* ✅ Bigger request description ABOVE stock-part selector */}
                                    <td className="px-3 py-2 align-top">
                                      <div className="grid gap-2">
                                        <textarea
                                          className={`${inputBase} w-full py-1.5 text-xs`}
                                          value={it.description ?? ""}
                                          placeholder="Requested part / notes (ex: Front spring & spring attachment)"
                                          onChange={(e) =>
                                            updateItem(r.req.id, String(it.id), {
                                              description: e.target.value,
                                            })
                                          }
                                          onBlur={() =>
                                            void persistItemFields(String(it.id), {
                                              description: String(it.description ?? "").trim(),
                                            })
                                          }
                                          disabled={rowBusy}
                                          rows={2}
                                        />

                                        <div className="grid gap-2 sm:grid-cols-2">
                                          <label className="grid gap-1 text-[11px] text-[color:var(--theme-text-muted)]">
                                            Part #
                                            <input
                                              className={`${inputBase} w-full py-1.5 text-xs`}
                                              value={it.requested_part_number ?? ""}
                                              placeholder="FL500S"
                                              onChange={(e) =>
                                                updateItem(r.req.id, String(it.id), {
                                                  requested_part_number: e.target.value,
                                                })
                                              }
                                              onBlur={() =>
                                                void (async () => {
                                                  await persistItemFields(String(it.id), {
                                                    requested_part_number: String(it.requested_part_number ?? "").trim() || null,
                                                  });
                                                  await load();
                                                })()
                                              }
                                              disabled={rowBusy}
                                            />
                                          </label>
                                          <label className="grid gap-1 text-[11px] text-[color:var(--theme-text-muted)]">
                                            Manufacturer
                                            <input
                                              className={`${inputBase} w-full py-1.5 text-xs`}
                                              value={it.requested_manufacturer ?? ""}
                                              placeholder="Motorcraft / Ford"
                                              onChange={(e) =>
                                                updateItem(r.req.id, String(it.id), {
                                                  requested_manufacturer: e.target.value,
                                                })
                                              }
                                              onBlur={() =>
                                                void (async () => {
                                                  await persistItemFields(String(it.id), {
                                                    requested_manufacturer: String(it.requested_manufacturer ?? "").trim() || null,
                                                  });
                                                  await load();
                                                })()
                                              }
                                              disabled={rowBusy}
                                            />
                                          </label>
                                        </div>

                                        <select
                                          className={`${selectBase} w-full py-1.5`}
                                          value={it.ui_part_id ?? ""}
                                          onChange={(e) => {
                                            applyInventoryPartToItem(
                                              r.req.id,
                                              it,
                                              e.target.value || null,
                                            );
                                          }}
                                          disabled={rowBusy}
                                        >
                                          <option value="">— select —</option>
                                          {parts.map((p) => (
                                            <option
                                              key={String(p.id)}
                                              value={String(p.id)}
                                            >
                                              {p.sku ? `${p.sku} — ${p.name}` : p.name}
                                            </option>
                                          ))}
                                        </select>



                                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[color:var(--theme-text-secondary)]">
                                          {showSuggestion && topSuggestion ? (
                                            <details className="group inline-flex rounded-full border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-2 py-1">
                                              <summary className="cursor-pointer list-none text-[color:var(--theme-text-secondary)]">
                                                AI match: <span className="text-[color:var(--theme-text-primary)]">{topSuggestion.name}</span>
                                                <span className={topSuggestion.qty_available > 0 ? "ml-1 text-emerald-300" : "ml-1 text-amber-300"}>
                                                  {topSuggestion.qty_available > 0 ? `${topSuggestion.qty_available} available` : "no stock — order"}
                                                </span>
                                              </summary>
                                              <div className="mt-2 max-w-md rounded-lg border border-[color:var(--desktop-border)] bg-[color:var(--theme-surface-page)] p-2 text-[color:var(--theme-text-secondary)] shadow-xl">
                                                <div className="font-medium text-[color:var(--theme-text-primary)]">{suggestionDisplay?.headline ?? "Inventory match"}</div>
                                                {topSuggestion.sku_or_part_number ? <div>Part/SKU: {topSuggestion.sku_or_part_number}</div> : null}
                                                <div>{suggestionDisplay?.technicalReasons.slice(0, 3).join(" · ")}</div>
                                                <button
                                                  type="button"
                                                  className="mt-2 underline decoration-dotted underline-offset-2 hover:text-[color:var(--theme-text-primary)]"
                                                  onClick={() => applyInventoryPartToItem(r.req.id, it, topSuggestion.part_id)}
                                                  disabled={rowBusy || topSuggestion.part_id === it.ui_part_id}
                                                >
                                                  Use Inventory
                                                </button>
                                              </div>
                                            </details>
                                          ) : null}
                                          {hasAttachedPart && topSuggestion ? (
                                            <span className="rounded-full border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-2 py-1 text-[color:var(--theme-text-muted)]">
                                              Alternative match available
                                            </span>
                                          ) : null}
                                          {canCreateInventory ? (
                                            <button
                                              type="button"
                                              className="rounded-full border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-2 py-1 text-[color:var(--theme-text-secondary)] hover:text-[color:var(--theme-text-primary)]"
                                              onClick={() => openCreateInventoryModal(r.req.id, it)}
                                              disabled={rowBusy}
                                            >
                                              Add to Stock
                                            </button>
                                          ) : null}
                                          {supplierSuggestion ? (
                                            <details className="group inline-flex rounded-full border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-2 py-1">
                                              <summary className="cursor-pointer list-none text-[color:var(--theme-text-secondary)]">
                                                Supplier: <span className="text-[color:var(--theme-text-primary)]">{supplierSuggestion.supplier_name ?? "review"}</span>
                                                <span className="ml-1 text-[color:var(--theme-text-muted)]">{supplierSuggestion.open_po_id ? "open PO" : "order"}</span>
                                              </summary>
                                              <div className="mt-2 max-w-md rounded-lg border border-[color:var(--desktop-border)] bg-[color:var(--theme-surface-page)] p-2 text-[color:var(--theme-text-secondary)] shadow-xl">
                                                {supplierSuggestion.open_po_number ? <div>Open PO: {supplierSuggestion.open_po_number}</div> : null}
                                                {supplierSuggestion.suggested_unit_cost != null ? <div>Last cost: ${supplierSuggestion.suggested_unit_cost.toFixed(2)}</div> : null}
                                                <div>{supplierSuggestion.reasons.slice(0, 3).join(" · ")}</div>
                                                {supplierSuggestion.supplier_id ? (
                                                  <button
                                                    type="button"
                                                    className="mt-2 underline decoration-dotted underline-offset-2 hover:text-[color:var(--theme-text-primary)]"
                                                    onClick={() => applySupplierSuggestionSelection(r.req.id, String(it.id), supplierSuggestion)}
                                                    disabled={rowBusy || (it.ui_supplier_id === supplierSuggestion.supplier_id && (!supplierSuggestion.open_po_id || it.ui_po_id === supplierSuggestion.open_po_id))}
                                                  >
                                                    Apply supplier/PO suggestion
                                                  </button>
                                                ) : null}
                                                {supplierSuggestionApplied ? <div className="mt-1 text-[color:var(--theme-text-muted)]">Suggested supplier selected — confirm with Create/Re-use PO.</div> : null}
                                              </div>
                                            </details>
                                          ) : null}
                                        </div>
                                        {approved > 0 || isQuoteOnlyPreApprovalItem ? (
                                          <div className="text-[11px] text-[color:var(--theme-text-muted)]">
                                            State{" "}
                                            <span className="text-[color:var(--theme-text-primary)]">
                                              {isQuoteOnlyPreApprovalItem && String(it.status ?? "").toLowerCase() === "quoted"
                                                ? "Quoted"
                                                : itemFlowLabel(itemState)}
                                            </span>
                                            {isQuoteOnlyPreApprovalItem ? (
                                              <>
                                                <span className="text-[color:var(--theme-text-muted)]"> · </span>
                                                <span className="text-[rgba(242,210,187,0.94)]">
                                                  Waiting for customer approval before allocation
                                                </span>
                                              </>
                                            ) : (
                                              <>
                                                <span className="text-[color:var(--theme-text-muted)]"> · </span>
                                                Approved{" "}
                                                <span className="text-[color:var(--theme-text-primary)]">
                                                  {approved}
                                                </span>{" "}
                                                <span className="text-[color:var(--theme-text-muted)]">·</span>{" "}
                                                Received{" "}
                                                <span className="text-[color:var(--theme-text-primary)]">
                                                  {received}
                                                </span>{" "}
                                                <span className="text-[color:var(--theme-text-muted)]">·</span>{" "}
                                                Remaining{" "}
                                                <span className="text-[color:var(--theme-text-primary)]">
                                                  {remaining}
                                                </span>
                                              </>
                                            )}
                                            {trustMeta ? (
                                              <span className={`ml-2 inline-flex rounded-full border px-2 py-0.5 ${trustBadgeTone(trustMeta.level)}`}>
                                                {trustLevelLabel(trustMeta.level)}
                                              </span>
                                            ) : null}
                                          </div>
                                        ) : null}
                                        {trustMeta && trustMeta.reasons.length > 0 ? (
                                          <div className="text-[11px] text-[var(--accent-copper-light)]/90">
                                            {trustMeta.reasons.slice(0, 2).join(" · ")}
                                          </div>
                                        ) : null}
                                        {conflictWarning ? (
                                          <div className="rounded-lg border border-amber-400/40 bg-amber-950/25 px-3 py-2 text-xs text-amber-100">
                                            <div className="font-semibold">Possible mismatch</div>
                                            <div className="mt-1 text-amber-100/90">{conflictWarning}</div>
                                            <div className="mt-2 flex flex-wrap gap-2">
                                              <button
                                                type="button"
                                                className="rounded-md border border-amber-300/40 px-2 py-1 text-[11px] hover:bg-amber-300/10"
                                                disabled={rowBusy}
                                                onClick={() => {
                                                  setConflictOverrideByItemId((prev) => ({ ...prev, [String(it.id)]: true }));
                                                  setConflictWarningByItemId((prev) => {
                                                    const next = { ...prev };
                                                    delete next[String(it.id)];
                                                    return next;
                                                  });
                                                  toast.success("Mismatch override enabled for this item. Click Add again to continue.");
                                                }}
                                              >
                                                Use anyway
                                              </button>
                                              <button
                                                type="button"
                                                className="rounded-md border border-amber-300/40 px-2 py-1 text-[11px] hover:bg-amber-300/10"
                                                disabled={rowBusy}
                                                onClick={() => void clearRequestedPartNumber(r.req.id, String(it.id))}
                                              >
                                                Clear part number
                                              </button>
                                            </div>
                                          </div>
                                        ) : null}
                                      </div>
                                    </td>

                                    <td className="p-3 text-right align-top">
                                      <input
                                        type="number"
                                        min={1}
                                        step={1}
                                        className={`${inputBase} w-20 py-1.5 text-right text-xs`}
                                        value={
                                          Number.isFinite(it.ui_qty)
                                            ? String(it.ui_qty)
                                            : "1"
                                        }
                                        onChange={(e) => {
                                          const raw = e.target.value;
                                          const nextQty =
                                            raw === ""
                                              ? 1
                                              : Math.max(
                                                  1,
                                                  Math.floor(toNum(raw, 1)),
                                                );
                                          updateItem(r.req.id, String(it.id), {
                                            ui_qty: nextQty,
                                            qty: nextQty,
                                          });
                                        }}
                                        onBlur={() =>
                                          void persistItemFields(String(it.id), {
                                            qty: Math.max(1, Math.floor(toNum(it.ui_qty, 1))),
                                          })
                                        }
                                        disabled={rowBusy}
                                      />
                                    </td>

                                    <td className="p-3 text-right align-top">
                                      <input
                                        type="number"
                                        step={0.01}
                                        className={`${inputBase} w-28 py-1.5 text-right text-xs`}
                                        value={
                                          it.ui_price == null ? "" : String(it.ui_price)
                                        }
                                        onChange={(e) => {
                                          const raw = e.target.value;
                                          updateItem(r.req.id, String(it.id), {
                                            ui_price:
                                              raw === "" ? undefined : toNum(raw, 0),
                                          });
                                        }}
                                        onBlur={() =>
                                          void persistItemFields(String(it.id), {
                                            quoted_price: it.ui_price == null ? null : it.ui_price,
                                          })
                                        }
                                        disabled={rowBusy}
                                      />
                                    </td>

                                    {/* PO column */}
                                    <td className="px-3 py-2 align-top">
                                      <div className="grid gap-2">
                                        <select
                                          className={`${selectBase} w-[220px] py-1.5`}
                                          value={uiPoId}
                                          onChange={(e) => {
                                            const next = e.target.value || "";
                                            if (next) {
                                              void createPoLineForItem(it, next);
                                            } else {
                                              void clearItemPoAssignment(it);
                                            }
                                          }}
                                          disabled={
                                            rowBusy ||
                                            !isRequestOperationallyReleased(r.req.status)
                                          }
                                          title={
                                            isRequestOperationallyReleased(r.req.status)
                                              ? "Add the uncovered approved quantity to this PO"
                                              : "PO ordering unlocks after approval"
                                          }
                                        >
                                          <option value="">— no PO —</option>
                                          {pos.map((po) => (
                                            <option
                                              key={String(po.id)}
                                              value={String(po.id)}
                                            >
                                              {poLabelById.get(String(po.id)) ??
                                                `${String(po.id).slice(0, 8)} • ${String(
                                                  po.status ?? "open",
                                                )}`}
                                            </option>
                                          ))}
                                        </select>

                                        <details className="rounded-xl border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                                          <summary className="cursor-pointer select-none text-xs text-[color:var(--theme-text-secondary)]">
                                            Create PO for supplier
                                          </summary>

                                          <div className="mt-2 grid gap-2">
                                            <div className="text-[11px] text-[color:var(--theme-text-muted)]">
                                              Rule: one PO per supplier. If one exists
                                              (not received), we reuse it.
                                            </div>

                                            <select
                                              className={selectBase}
                                              value={it.ui_supplier_id ?? ""}
                                              onChange={(e) =>
                                                updateItem(r.req.id, String(it.id), {
                                                  ui_supplier_id:
                                                    e.target.value || "",
                                                })
                                              }
                                              disabled={rowBusy}
                                            >
                                              <option value="">— choose supplier —</option>
                                              {supplierOptions.map((o) => (
                                                <option key={o.value} value={o.value}>
                                                  {o.label}
                                                </option>
                                              ))}
                                            </select>

                                            <div className="flex items-center gap-2">
                                              <input
                                                className={`${inputBase} flex-1 py-2 text-xs`}
                                                placeholder="Or type new supplier name…"
                                                onChange={(e) =>
                                                  updateItem(r.req.id, String(it.id), {
                                                    ui_supplier_id: `__new__:${e.target.value}`,
                                                  })
                                                }
                                                disabled={rowBusy}
                                              />
                                            </div>

                                            <button
                                              className={`${btnCopper} py-1.5 text-xs`}
                                              type="button"
                                              disabled={rowBusy}
                                              onClick={async () => {
                                                if (!wo?.shop_id) return;

                                                const raw = String(
                                                  it.ui_supplier_id ?? "",
                                                ).trim();
                                                if (!raw) {
                                                  toast.error(
                                                    "Choose a supplier or type a new one.",
                                                  );
                                                  return;
                                                }

                                                let supplierId: string | null = null;

                                                if (raw.startsWith("__new__:")) {
                                                  const name = raw.replace(
                                                    "__new__:",
                                                    "",
                                                  );
                                                  supplierId =
                                                    await ensureSupplierExists(
                                                      String(wo.shop_id),
                                                      name,
                                                    );
                                                } else {
                                                  supplierId = raw;
                                                }

                                                if (!supplierId) return;

                                                await createOrReusePoAndAssign(
                                                  it,
                                                  supplierId,
                                                  null,
                                                );
                                              }}
                                            >
                                              Create / Reuse PO & Assign
                                            </button>

                                            {poLabel ? (
                                              <div className="text-[11px] text-[color:var(--theme-text-muted)]">
                                                Currently assigned:{" "}
                                                <span className="text-[color:var(--theme-text-primary)]">
                                                  {poLabel}
                                                </span>
                                              </div>
                                            ) : null}
                                          </div>
                                        </details>
                                      </div>
                                    </td>

                                    <td className="p-3 text-right tabular-nums align-top">
                                      {lineTotal.toFixed(2)}
                                    </td>

                                    <td className="px-3 py-2 align-top">
                                      <div className="flex flex-col items-stretch gap-2">
                                        <button
                                          className={`${btnCopper} py-1.5 text-xs`}
                                          onClick={() =>
                                            isQuoteOnlyPreApprovalItem
                                              ? void savePreApprovalQuote(r.req.id, String(it.id))
                                              : void addAndAttach(r.req.id, String(it.id))
                                          }
                                          disabled={
                                            isQuoteOnlyPreApprovalItem
                                              ? quoteSaveDisabled
                                              : rowBusy || !canMaterializeToLine
                                          }
                                          title={
                                            isQuoteOnlyPreApprovalItem
                                              ? "Save quote pricing now. Allocation unlocks after customer approval."
                                              : !canMaterializeToLine
                                                ? hasQuoteLineOrigin
                                                  ? "Quote-originated parts are not allocated until approval creates a work order line link"
                                                  : "Missing work order line link"
                                                : undefined
                                          }
                                          type="button"
                                        >
                                          {rowBusy
                                            ? "Saving…"
                                            : isQuoteOnlyPreApprovalItem
                                              ? "Save Quote"
                                              : "Save to Work Order"}
                                        </button>

                                        {isQuoteOnlyPreApprovalItem ? (
                                          <div className="rounded-lg border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-2 py-1.5 text-[11px] text-[rgba(242,210,187,0.94)]">
                                            {String(it.status ?? "").toLowerCase() === "quoted"
                                              ? "Quote saved. Allocation will unlock after customer approval."
                                              : "Waiting for customer approval before allocation"}
                                          </div>
                                        ) : null}

                                        <button
                                          className={btnGhost}
                                          onClick={() => openReceiveFor(r.req.id, it)}
                                          disabled={rowBusy || !canReceive}
                                          type="button"
                                          title={
                                            !resolvedDefaultLocId
                                              ? "No stock locations exist for this shop"
                                              : canReceive
                                                ? "Receive against this request item"
                                                : "Needs qty_approved > qty_received and a selected part"
                                          }
                                        >
                                          Receive…
                                        </button>

                                        <button
                                          className={`${btnDanger} py-1.5 text-xs`}
                                          onClick={() =>
                                            void deleteLine(r.req.id, String(it.id))
                                          }
                                          disabled={rowBusy}
                                          type="button"
                                        >
                                          Delete
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </RequestItemsTable>

                      <div className="grid gap-3 md:grid-cols-2">
                        <RequestProcurementPanel />
                        <RequestReceivingPanel />
                      </div>

                      {locations.length === 0 && (
                        <div className="mt-3 text-xs text-[color:var(--theme-text-muted)]">
                          No stock locations exist for this shop, so inventory
                          allocation is skipped. Parts will still be saved to the
                          request item.
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}


      {createInventoryDraft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--theme-surface-overlay)] p-4 backdrop-blur-sm">
          <div className={`${glassCard} w-full max-w-2xl overflow-hidden`}>
            <div className={`${glassHeader} flex items-center justify-between px-4 py-3`}>
              <div>
                <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">Create inventory item</div>
                <div className="text-xs text-[color:var(--theme-text-secondary)]">Attach it to this parts request item immediately.</div>
              </div>
              <button className={btnGhost} type="button" onClick={() => setCreateInventoryDraft(null)}>
                Close
              </button>
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              {[
                ["Name", "name", "Motorcraft oil filter"],
                ["Part #", "partNumber", "FL500S"],
                ["Manufacturer", "manufacturer", "Motorcraft"],
                ["SKU", "sku", "FL500S"],
                ["Category", "category", "Filters"],
                ["Price", "price", "12.99"],
                ["Default supplier", "supplier", "Ford / Motorcraft"],
              ].map(([label, key, placeholder]) => (
                <label key={key} className="grid gap-1 text-xs text-[color:var(--theme-text-secondary)]">
                  {label}
                  <input
                    className={`${inputBase} w-full`}
                    value={String(createInventoryDraft[key as keyof CreateInventoryDraft] ?? "")}
                    placeholder={placeholder}
                    type={key === "price" ? "number" : "text"}
                    step={key === "price" ? 0.01 : undefined}
                    onChange={(e) =>
                      setCreateInventoryDraft((prev) =>
                        prev ? { ...prev, [key]: e.target.value } : prev,
                      )
                    }
                  />
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 border-t border-[color:var(--desktop-border)] px-4 py-3">
              <button className={btnGhost} type="button" onClick={() => setCreateInventoryDraft(null)}>
                Cancel
              </button>
              <button
                className={btnCopper}
                type="button"
                disabled={savingItemId === createInventoryDraft.itemId}
                onClick={() => void saveCreatedInventoryItem()}
              >
                {savingItemId === createInventoryDraft.itemId ? "Saving…" : "Create and attach"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ReceiveDrawer
        open={recvOpen}
        item={recvItem}
        onClose={() => {
          setRecvOpen(false);
          setRecvItem(null);
          void load();
        }}
        locations={locOptions}
        defaultLocationId={resolvedDefaultLocId}
        purchaseOrders={poOptions}
        defaultPoId={selectedPo || ""}
        lockLocation={false}
        lockPo={false}
      />
    </div>
  );
}
