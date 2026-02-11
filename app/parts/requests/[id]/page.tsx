// app/parts/requests/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { toast } from "sonner";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type WorkOrderRow = DB["public"]["Tables"]["work_orders"]["Row"];
type RequestRow = DB["public"]["Tables"]["part_requests"]["Row"];
type ItemRow = DB["public"]["Tables"]["part_request_items"]["Row"];
type PartRow = DB["public"]["Tables"]["parts"]["Row"];
type LocationRow = DB["public"]["Tables"]["stock_locations"]["Row"];
type PurchaseOrderRow = DB["public"]["Tables"]["purchase_orders"]["Row"];
type SupplierRow = DB["public"]["Tables"]["suppliers"]["Row"];

type WorkOrderLineRow = DB["public"]["Tables"]["work_order_lines"]["Row"];
type LineLite = Pick<WorkOrderLineRow, "id" | "complaint" | "description">;

type Status = RequestRow["status"];

type UpsertResponse = {
  ok: boolean;
  menuItemId?: string;
  updated?: boolean;
  error?: string;
  detail?: string;
};

type UiItem = ItemRow & {
  ui_part_id: string | null;
  ui_qty: number;
  ui_price?: number; // sell/unit (undefined = not set)
  ui_added?: boolean; // purely UI “added” state (not used for logic)

  // PO assignment UI
  ui_po_id?: string; // derived from it.po_id (if exists) else ""
  ui_supplier_id?: string; // for create/select (optional helper)
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
  const hasPart = isNonEmptyString(it.part_id ?? it.ui_part_id ?? null);
  const hasPrice = it.quoted_price != null || it.ui_price != null;
  const qty = toNum(it.qty ?? it.ui_qty, 0);
  return hasPart && hasPrice && qty > 0;
}

function computeRequestBadge(
  req: RequestRow,
  items: UiItem[],
): "needs_quote" | "quoted" {
  const status = (req.status ?? "requested").toLowerCase();
  if (status === "quoted" || status === "approved" || status === "fulfilled")
    return "quoted";
  const allDone = items.length > 0 && items.every((it) => isRowComplete(it));
  return allDone ? "quoted" : "needs_quote";
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
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [wo, setWo] = useState<WorkOrderRow | null>(null);
  const [lineById, setLineById] = useState<Map<string, LineLite>>(
    () => new Map(),
  );
  const [requests, setRequests] = useState<RequestUi[]>([]);
  const [parts, setParts] = useState<PartRow[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [defaultLocationId, setDefaultLocationId] = useState<string>("");

  const [pos, setPOs] = useState<PurchaseOrderRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [selectedPo, setSelectedPo] = useState<string>("");

  const [loading, setLoading] = useState<boolean>(true);
  const [savingReqId, setSavingReqId] = useState<string | null>(null);
  const [savingItemId, setSavingItemId] = useState<string | null>(null);

  // Drawer
  const [recvOpen, setRecvOpen] = useState<boolean>(false);
  const [recvItem, setRecvItem] = useState<DrawerItem | null>(null);

  // ---- Theme (glass + burnt copper / metallic; no orange-400/500) ----
  const COPPER_BORDER = "border-[#8b5a2b]/60";
  const COPPER_TEXT = "text-[#c88a4d]";
  const COPPER_TEXT_SOFT = "text-[#b27a45]";
  const COPPER_HOVER_BG = "hover:bg-[#8b5a2b]/10";
  const COPPER_FOCUS_RING = "focus:ring-2 focus:ring-[#8b5a2b]/35";

  const pageWrap = "space-y-4 p-6 text-white";
  const glassCard =
    "rounded-xl border border-white/10 bg-neutral-950/35 backdrop-blur-xl shadow-[0_0_0_1px_rgba(255,255,255,0.03)_inset]";
  const glassHeader =
    "bg-gradient-to-b from-white/5 to-transparent border-b border-white/10";
  const inputBase = `rounded-lg border bg-neutral-950/40 px-3 py-2 text-sm text-white placeholder:text-neutral-500 border-white/10 focus:outline-none ${COPPER_FOCUS_RING}`;
  const selectBase = `rounded-lg border bg-neutral-950/40 px-2 py-2 text-xs text-white border-white/10 focus:outline-none ${COPPER_FOCUS_RING}`;

  const btnBase =
    "inline-flex items-center justify-center rounded-lg border px-3 py-2 text-sm transition disabled:opacity-60";
  const btnGhost = `${btnBase} border-white/10 bg-neutral-950/20 hover:bg-white/5`;
  const btnCopper = `${btnBase} ${COPPER_BORDER} ${COPPER_TEXT} bg-neutral-950/20 ${COPPER_HOVER_BG}`;
  const btnDanger = `${btnBase} border-red-900/60 bg-neutral-950/20 text-red-200 hover:bg-red-900/20`;

  const pillBase =
    "inline-flex items-center whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium";
  const pillNeedsQuote = `${pillBase} border-red-500/35 bg-red-950/35 text-red-200`;
  const pillQuoted = `${pillBase} border-teal-500/35 bg-teal-950/25 text-teal-200`;

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

  async function load(): Promise<void> {
    setLoading(true);

    const woRow = await resolveWorkOrder(routeId);
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
      setLoading(false);
      return;
    }

    setWo(woRow);

    const { data: reqs, error: reqErr } = await supabase
      .from("part_requests")
      .select("*")
      .eq("work_order_id", woRow.id)
      .order("created_at", { ascending: false });

    if (reqErr) toast.error(reqErr.message);

    const reqList = (reqs ?? []) as RequestRow[];
    const reqIds = reqList.map((r) => r.id);

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
          const poId = (row as unknown as { po_id?: string | null }).po_id ?? null;
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

    // ✅ Load job complaint/description for each request's line (for UI + prefills)
    {
      const lineIds = new Set<string>();

      for (const r of uiRequests) {
        const id = resolveWorkOrderLineId(r.req, r.items);
        if (id && isUuid(id)) lineIds.add(id);
      }

      if (lineIds.size > 0) {
        const { data: lines, error: lErr } = await supabase
          .from("work_order_lines")
          .select("id, complaint, description")
          .in("id", Array.from(lineIds));

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
      } else {
        setLineById(new Map());
      }
    }

    const shopId = woRow.shop_id ?? null;
    if (shopId) {
      const [{ data: ps }, { data: locs }, { data: poRows }, { data: supRows }] =
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
        ]);

      setParts((ps ?? []) as PartRow[]);

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

      if (
        selectedPo &&
        !(poRows ?? []).some((p) => String(p.id) === selectedPo)
      )
        setSelectedPo("");
    } else {
      setParts([]);
      setLocations([]);
      setDefaultLocationId("");
      setPOs([]);
      setSuppliers([]);
      setSelectedPo("");
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

  function updateItem(reqId: string, itemId: string, patch: Partial<UiItem>): void {
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

  async function addRow(reqId: string): Promise<void> {
    const target = requests.find((r) => r.req.id === reqId);
    if (!target) return;

    setSavingReqId(reqId);
    try {
      const lineId = resolveWorkOrderLineId(target.req, target.items);
      const lineText =
        lineId && isUuid(lineId) ? lineLabelFrom(lineById.get(lineId)) : "";

      const insertPayload: DB["public"]["Tables"]["part_request_items"]["Insert"] =
        {
          request_id: target.req.id,
          work_order_line_id: lineId,
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

      const poId = (data as unknown as { po_id?: string | null }).po_id ?? null;

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
    } finally {
      setSavingReqId(null);
    }
  }

  async function deleteLine(reqId: string, itemId: string): Promise<void> {
    const ok = window.confirm("Remove this item from the request?");
    if (!ok) return;

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

    setRequests((prev) =>
      prev.map((r) =>
        r.req.id === reqId
          ? { ...r, items: r.items.filter((x) => x.id !== itemId) }
          : r,
      ),
    );
    toast.success("Item removed.");
  }

  function openReceiveFor(reqId: string, it: UiItem): void {
    const partId = (it.part_id ?? it.ui_part_id ?? null) as string | null;
    const part = partId
      ? parts.find((p) => String(p.id) === String(partId)) ?? null
      : null;

    const approved = n((it as unknown as { qty_approved?: unknown }).qty_approved);
    const received = n((it as unknown as { qty_received?: unknown }).qty_received);
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
    });
    setRecvOpen(true);
  }

  async function setItemPo(itemId: string, poId: string | null): Promise<boolean> {
    // ✅ Validate uuid (prevents PostgREST 400 on uuid cast)
    if (poId && !isUuid(poId)) {
      toast.error("Invalid PO id.");
      return false;
    }

    setSavingItemId(itemId);
    try {
      // po_id exists in DB only if you added it; we still send it and rely on DB types at runtime.
      const { data: updated, error } = await supabase
        .from("part_request_items")
        .update(
          { po_id: poId } as unknown as DB["public"]["Tables"]["part_request_items"]["Update"],
        )
        .eq("id", itemId)
        .select("id")
        .maybeSingle();

      if (error) {
        toast.error(error.message);
        return false;
      }
      if (!updated?.id) {
        toast.error("Update did not apply (no matching row or blocked).");
        return false;
      }

      // update UI state
      setRequests((prev) =>
        prev.map((r) => ({
          ...r,
          items: r.items.map((it) =>
            String(it.id) === String(itemId)
              ? ({
                  ...it,
                  ui_po_id: poId ?? "",
                  // keep raw column in sync for any other logic that reads it
                  po_id: poId ?? null,
                } as UiItem)
              : it,
          ),
        })),
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
        { shop_id: shopId, name } as unknown as DB["public"]["Tables"]["suppliers"]["Insert"],
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
      .insert(insert as unknown as DB["public"]["Tables"]["purchase_orders"]["Insert"])
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

    const ok = await setItemPo(String(item.id), poId);
    if (!ok) return;

    toast.success(`Assigned PO ${poId.slice(0, 8)}.`);
  }

  async function addAndAttach(reqId: string, itemId: string): Promise<void> {
    const target = requests.find((r) => r.req.id === reqId);
    const it = target?.items.find((x) => x.id === itemId);
    if (!target || !it) return;

    const partId = it.ui_part_id;
    const qty = toNum(it.ui_qty, 0);
    const price = it.ui_price;

    if (!partId) {
      toast.error("Pick a stock part first.");
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

    const lineId = resolveWorkOrderLineId(target.req, target.items);
    if (!lineId) {
      toast.error("Missing or invalid work order line id (must be a UUID).");
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

      // ✅ work_order_line_id must be UUID (avoid passing legacy strings)
      const safeLineId = isUuid(it.work_order_line_id)
        ? it.work_order_line_id
        : lineId;

      const payload = {
        part_id: partId,
        description: desc || it.description || "Part",
        qty,
        quoted_price: price,
        vendor: null,
        markup_pct: null,
        work_order_line_id: safeLineId,
        ...(poId ? { po_id: poId } : {}),
      } as unknown as DB["public"]["Tables"]["part_request_items"]["Update"];

      // ✅ select to detect “no row updated” and avoid silent failures
      const { data: updated, error: updErr } = await supabase
        .from("part_request_items")
        .update(payload)
        .eq("id", it.id)
        .select("id")
        .maybeSingle();

      if (updErr) {
        toast.error(updErr.message);
        return;
      }
      if (!updated?.id) {
        toast.error("Update did not apply (no matching row or blocked).");
        return;
      }

      if (locId) {
        const { error } = await supabase.rpc(
          "upsert_part_allocation_from_request_item",
          {
            p_request_item_id: it.id,
            p_location_id: locId,
            p_create_stock_move: true,
          },
        );

        if (error) {
          toast.error(error.message);
          return;
        }
      } else {
        toast.warning(
          "No stock location exists for this shop. Item saved, but inventory was not allocated.",
        );
      }

      const nextItems = target.items.map((x) => {
        if (x.id !== itemId) return x;
        return {
          ...x,
          part_id: partId,
          quoted_price: price,
          qty,
          work_order_line_id: safeLineId,
          ui_added: true,
          ui_po_id: poId ?? "",
          po_id: poId ?? null,
        } as UiItem;
      });

      const allNowQuoted =
        nextItems.length > 0 && nextItems.every((x) => isRowComplete(x));

      setRequests((prev) =>
        prev.map((r) =>
          r.req.id !== reqId
            ? r
            : {
                req: {
                  ...r.req,
                  status: allNowQuoted ? "quoted" : (r.req.status ?? "requested"),
                },
                items: r.items.map((x) =>
                  x.id !== itemId
                    ? x
                    : ({
                        ...x,
                        part_id: partId,
                        quoted_price: price,
                        qty,
                        work_order_line_id: safeLineId,
                        ui_added: true,
                        ui_po_id: poId ?? "",
                        po_id: poId ?? null,
                      } as UiItem),
                ),
              },
        ),
      );

      if (allNowQuoted) {
        const { error: statusErr } = await supabase.rpc("set_part_request_status", {
          p_request: reqId,
          p_status: "quoted" satisfies Status,
        });
        if (statusErr) toast.warning(statusErr.message);
      }

      window.dispatchEvent(new Event("parts-request:submitted"));
      window.dispatchEvent(new Event("wo:parts-used"));

      try {
        const res = await fetch("/api/menu-items/upsert-from-line", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workOrderLineId: safeLineId }),
        });

        const j = (await res.json().catch(() => null)) as UpsertResponse | null;

        if (!res.ok || !j?.ok) {
          toast.warning(
            j?.detail || j?.error || "Added, but couldn’t save to menu items.",
          );
        }
      } catch {
        // ignore
      }

      toast.success("Added to the work order line.");
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

  return (
    <div className={pageWrap}>
      <button className={btnGhost} onClick={() => router.back()} type="button">
        ← Back
      </button>

      {loading ? (
        <div className={`${glassCard} p-4 text-neutral-300`}>Loading…</div>
      ) : !wo ? (
        <div className={`${glassCard} p-4 text-neutral-300`}>
          Work order not found / not visible.
        </div>
      ) : (
        <>
          <div className={`${glassCard} overflow-hidden`}>
            <div className={`${glassHeader} px-5 py-4`}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xl font-semibold tracking-wide">
                    Work Order <span className={COPPER_TEXT}>{woDisplay}</span>
                  </div>
                  <div className="mt-1 text-sm text-neutral-400">
                    Parts requests for this work order.
                  </div>
                </div>

                {/* Optional PO selector (for receive drawer default) */}
                <div className="flex items-center gap-2">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                    PO
                  </div>
                  <select
                    className={`${selectBase} w-72`}
                    value={selectedPo}
                    onChange={(e) => setSelectedPo(e.target.value)}
                    title="Optional: choose PO to apply receiving against"
                  >
                    <option value="">— none —</option>
                    {pos.map((po) => (
                      <option key={String(po.id)} value={String(po.id)}>
                        {poLabelById.get(String(po.id)) ??
                          `${String(po.id).slice(0, 8)} • ${String(po.status ?? "open")}`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-3 text-xs text-neutral-400">
                Add parts to attach them to the work order line. The request becomes{" "}
                <span className={COPPER_TEXT_SOFT}>quoted</span> automatically once
                every row has a part + qty + price.
              </div>
            </div>
          </div>

          {requests.length === 0 ? (
            <div className={`${glassCard} p-4 text-neutral-400`}>
              No parts requests for this work order yet.
            </div>
          ) : (
            <div className="space-y-4">
              {requests.map((r) => {
                const badge = computeRequestBadge(r.req, r.items);
                const busy = savingReqId === r.req.id;

                const lineId = resolveWorkOrderLineId(r.req, r.items);
                const jobText =
                  lineId && isUuid(lineId)
                    ? lineLabelFrom(lineById.get(lineId))
                    : "";

                return (
                  <div key={r.req.id} className={`${glassCard} overflow-hidden`}>
                    <div className={`${glassHeader} px-5 py-4`}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold">
                            Request{" "}
                            <span className={COPPER_TEXT}>
                              #{r.req.id.slice(0, 8)}
                            </span>
                          </div>

                          <div className="mt-1 text-xs text-neutral-400">
                            Created{" "}
                            {r.req.created_at
                              ? new Date(r.req.created_at).toLocaleString()
                              : "—"}
                            <span className="mx-2 text-neutral-600">·</span>
                            Line: {lineId ? lineId.slice(0, 8) : "—"}
                          </div>

                          {jobText ? (
                            <div className="mt-1 text-xs text-neutral-500">
                              Job:{" "}
                              <span className="text-neutral-300">{jobText}</span>
                            </div>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={
                              badge === "needs_quote" ? pillNeedsQuote : pillQuoted
                            }
                          >
                            {badge === "needs_quote" ? "Needs quote" : "Quoted"}
                          </span>

                          <button
                            className={btnGhost}
                            onClick={() => void addRow(r.req.id)}
                            disabled={busy}
                            type="button"
                          >
                            {busy ? "Working…" : "＋ Add part row"}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="p-4">
                      <div className="overflow-hidden rounded-xl border border-white/10 bg-neutral-950/20">
                        <table className="w-full text-sm">
                          <thead className="bg-white/5 text-neutral-400">
                            <tr>
                              <th className="p-3 text-left">Stock part</th>
                              <th className="p-3 text-left">Description</th>
                              <th className="p-3 text-right">Qty</th>
                              <th className="p-3 text-right">Price (unit)</th>
                              <th className="p-3 text-left">PO</th>
                              <th className="p-3 text-right">Line total</th>
                              <th className="w-[260px] p-3" />
                            </tr>
                          </thead>

                          <tbody>
                            {r.items.length === 0 ? (
                              <tr className="border-t border-white/10">
                                <td
                                  className="p-4 text-sm text-neutral-500"
                                  colSpan={7}
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
                                const canReceive =
                                  !!effectivePartId &&
                                  approved > 0 &&
                                  remaining > 0 &&
                                  !!resolvedDefaultLocId;

                                const uiPoId = (it.ui_po_id ?? "").trim();
                                const poLabel = uiPoId
                                  ? poLabelById.get(uiPoId) ?? uiPoId.slice(0, 8)
                                  : "";

                                return (
                                  <tr
                                    key={String(it.id)}
                                    className="border-t border-white/10"
                                  >
                                    <td className="p-3 align-top">
                                      <select
                                        className={`${selectBase} w-80`}
                                        value={it.ui_part_id ?? ""}
                                        onChange={(e) => {
                                          const nextPartId = e.target.value || null;
                                          const p = parts.find(
                                            (x) =>
                                              String(x.id) === String(nextPartId),
                                          );
                                          updateItem(r.req.id, String(it.id), {
                                            ui_part_id: nextPartId,
                                            description: (
                                              p?.name ??
                                              it.description ??
                                              ""
                                            ).trim(),
                                            ui_price:
                                              p?.price == null
                                                ? undefined
                                                : toNum(p.price, 0),
                                          });
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

                                      {approved > 0 ? (
                                        <div className="mt-2 text-[11px] text-neutral-500">
                                          Approved{" "}
                                          <span className="text-neutral-200">
                                            {approved}
                                          </span>{" "}
                                          <span className="text-neutral-600">·</span>{" "}
                                          Received{" "}
                                          <span className="text-neutral-200">
                                            {received}
                                          </span>{" "}
                                          <span className="text-neutral-600">·</span>{" "}
                                          Remaining{" "}
                                          <span className="text-neutral-200">
                                            {remaining}
                                          </span>
                                        </div>
                                      ) : null}
                                    </td>

                                    <td className="p-3 align-top">
                                      <input
                                        className={`${inputBase} w-full py-2 text-xs`}
                                        value={it.description ?? ""}
                                        placeholder="Description"
                                        onChange={(e) =>
                                          updateItem(r.req.id, String(it.id), {
                                            description: e.target.value,
                                          })
                                        }
                                        disabled={rowBusy}
                                      />
                                    </td>

                                    <td className="p-3 text-right align-top">
                                      <input
                                        type="number"
                                        min={1}
                                        step={1}
                                        className={`${inputBase} w-20 py-2 text-right text-xs`}
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
                                          });
                                        }}
                                        disabled={rowBusy}
                                      />
                                    </td>

                                    <td className="p-3 text-right align-top">
                                      <input
                                        type="number"
                                        step={0.01}
                                        className={`${inputBase} w-28 py-2 text-right text-xs`}
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
                                        disabled={rowBusy}
                                      />
                                    </td>

                                    {/* PO column */}
                                    <td className="p-3 align-top">
                                      <div className="grid gap-2">
                                        <select
                                          className={`${selectBase} w-[260px]`}
                                          value={uiPoId}
                                          onChange={(e) => {
                                            const next = e.target.value || "";
                                            updateItem(r.req.id, String(it.id), {
                                              ui_po_id: next,
                                            });
                                            void setItemPo(
                                              String(it.id),
                                              next ? next : null,
                                            );
                                          }}
                                          disabled={rowBusy}
                                          title="Assign this request item to a PO"
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

                                        <details className="rounded-xl border border-white/10 bg-neutral-950/20 px-3 py-2">
                                          <summary className="cursor-pointer select-none text-xs text-neutral-300">
                                            Create PO for supplier
                                          </summary>

                                          <div className="mt-2 grid gap-2">
                                            <div className="text-[11px] text-neutral-500">
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
                                              className={`${btnCopper} py-2 text-xs`}
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
                                              <div className="text-[11px] text-neutral-500">
                                                Currently assigned:{" "}
                                                <span className="text-neutral-200">
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

                                    <td className="p-3 align-top">
                                      <div className="flex flex-col items-stretch gap-2">
                                        <button
                                          className={`${btnCopper} py-2 text-xs`}
                                          onClick={() =>
                                            void addAndAttach(r.req.id, String(it.id))
                                          }
                                          disabled={rowBusy}
                                          type="button"
                                        >
                                          {rowBusy ? "Saving…" : "Add"}
                                        </button>

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
                                          className={`${btnDanger} py-2 text-xs`}
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
                      </div>

                      {locations.length === 0 && (
                        <div className="mt-3 text-xs text-neutral-500">
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