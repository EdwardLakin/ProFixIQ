// app/parts/requests/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { toast } from "sonner";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type RequestRow = DB["public"]["Tables"]["part_requests"]["Row"];
type ItemRow = DB["public"]["Tables"]["part_request_items"]["Row"];
type PartRow = DB["public"]["Tables"]["parts"]["Row"];
type LocationRow = DB["public"]["Tables"]["stock_locations"]["Row"];
type QuoteUpdate = DB["public"]["Tables"]["work_order_quote_lines"]["Update"];

type Status = RequestRow["status"];

type UpsertResponse = {
  ok: boolean;
  menuItemId?: string;
  updated?: boolean;
  error?: string;
  detail?: string;
};

type UiItem = ItemRow & {
  ui_added: boolean;
  ui_part_id: string | null;
  ui_qty: number;
  ui_price?: number; // undefined = not set
};

const CARD = "rounded-xl border border-white/12 bg-card/90";
const SUBCARD = "rounded-lg border border-white/10 bg-muted/70";
const BTN = "inline-flex items-center justify-center rounded-lg border px-3 py-2 text-sm font-semibold transition disabled:opacity-60";
const BTN_GHOST = `${BTN} border-white/12 bg-card/90 hover:bg-card/95`;
const BTN_COPPER = `${BTN} border-[#8b5a2b]/60 bg-card/90 text-[#c88a4d] hover:bg-[#8b5a2b]/10`;
const PILL_BASE =
  "inline-flex items-center whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold";
const PILL_NEEDS = `${PILL_BASE} border-red-500/40 bg-red-500/10 text-red-200`;
const PILL_QUOTED = `${PILL_BASE} border-teal-500/40 bg-teal-500/10 text-teal-200`;

function looksLikeUuid(s: string): boolean {
  return s.includes("-") && s.length >= 36;
}

function toNum(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

// in your schema, part_requests.job_id is used as the WO line id (and items may also have work_order_line_id)
function resolveWorkOrderLineId(currentReq: RequestRow | null, list: UiItem[]): string | null {
  for (const it of list) {
    if (isNonEmptyString(it.work_order_line_id)) return it.work_order_line_id;
  }
  if (isNonEmptyString(currentReq?.job_id)) return currentReq.job_id;
  return null;
}

export default function PartsRequestsForWorkOrderPage(): JSX.Element {
  const { id } = useParams<{ id: string }>(); // work_order id OR custom_id
  const router = useRouter();
  const sp = useSearchParams();

  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [loading, setLoading] = useState(true);

  const [wo, setWo] = useState<WorkOrder | null>(null);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [itemsByRequest, setItemsByRequest] = useState<Record<string, UiItem[]>>({});

  const [parts, setParts] = useState<PartRow[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [locationId, setLocationId] = useState<string>("");

  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [addingItem, setAddingItem] = useState(false);
  const [quoting, setQuoting] = useState(false);

  const selectedReq = useMemo(
    () => (selectedRequestId ? requests.find((r) => r.id === selectedRequestId) ?? null : null),
    [requests, selectedRequestId],
  );

  const rows = useMemo(() => {
    if (!selectedRequestId) return [];
    return itemsByRequest[selectedRequestId] ?? [];
  }, [itemsByRequest, selectedRequestId]);

  const workOrderLineId = useMemo(() => resolveWorkOrderLineId(selectedReq, rows), [selectedReq, rows]);

  const totalSell = useMemo(() => {
    let sum = 0;
    for (const it of rows) {
      if (!it.ui_added) continue;
      const qty = toNum(it.ui_qty, 0);
      const price = it.ui_price ?? 0;
      sum += price * qty;
    }
    return sum;
  }, [rows]);

  // For the “quote individually” behavior:
  // only require at least ONE staged row, not all rows.
  const stagedValid = useMemo(() => {
    const staged = rows.filter((r) => r.ui_added);
    if (staged.length === 0) return false;
    return staged.every((it) => {
      const qty = toNum(it.ui_qty, 0);
      return !!it.ui_part_id && qty > 0 && it.ui_price != null;
    });
  }, [rows]);

  async function load(): Promise<void> {
    setLoading(true);

    // 1) resolve WO (by uuid OR custom_id)
    let woRow: WorkOrder | null = null;

    if (looksLikeUuid(id)) {
      const res = await supabase.from("work_orders").select("*").eq("id", id).maybeSingle();
      woRow = (res.data as WorkOrder | null) ?? null;
    }

    if (!woRow) {
      const exact = await supabase.from("work_orders").select("*").eq("custom_id", id).maybeSingle();
      woRow = (exact.data as WorkOrder | null) ?? null;

      if (!woRow) {
        const ilike = await supabase.from("work_orders").select("*").ilike("custom_id", id.toUpperCase()).maybeSingle();
        woRow = (ilike.data as WorkOrder | null) ?? null;
      }
    }

    if (!woRow) {
      toast.error("Work order not found / not visible.");
      setWo(null);
      setRequests([]);
      setItemsByRequest({});
      setLoading(false);
      return;
    }

    setWo(woRow);

    // 2) load ALL part_requests for this work order
    const { data: reqs, error: reqErr } = await supabase
      .from("part_requests")
      .select("*")
      .eq("work_order_id", woRow.id)
      .order("created_at", { ascending: false });

    if (reqErr) toast.error(reqErr.message);

    const reqList = (reqs ?? []) as RequestRow[];
    setRequests(reqList);

    // default selection from querystring, else first request
    const fromQuery = sp.get("request");
    const initial =
      (fromQuery && reqList.some((r) => r.id === fromQuery) ? fromQuery : null) ??
      reqList[0]?.id ??
      null;
    setSelectedRequestId(initial);

    // 3) load items for those requests
    const reqIds = reqList.map((r) => r.id);
    const map: Record<string, UiItem[]> = {};

    if (reqIds.length) {
      const { data: items, error: itErr } = await supabase
        .from("part_request_items")
        .select("*")
        .in("request_id", reqIds)
        .order("id", { ascending: true });

      if (itErr) toast.error(itErr.message);

      const itemRows = (items ?? []) as ItemRow[];
      for (const row of itemRows) {
        const sell = row.quoted_price == null ? undefined : toNum(row.quoted_price, 0);
        const ui: UiItem = {
          ...row,
          ui_added: false,
          ui_part_id: row.part_id ?? null,
          ui_qty: toNum(row.qty, 1),
          ui_price: sell,
        };
        (map[row.request_id] ||= []).push(ui);
      }
    }

    setItemsByRequest(map);

    // 4) parts + locations (shop_id from part_requests if present)
    const shopId =
      (reqList.find((r) => r.shop_id)?.shop_id ?? null) ||
      
      (woRow as any)?.shop_id ||
      null;

    if (shopId) {
      const [{ data: ps }, { data: locs }] = await Promise.all([
        supabase.from("parts").select("*").eq("shop_id", shopId).order("name").limit(1000),
        supabase.from("stock_locations").select("*").eq("shop_id", shopId).order("code"),
      ]);

      setParts((ps ?? []) as PartRow[]);
      const locList = (locs ?? []) as LocationRow[];
      setLocations(locList);

      if (!locationId && locList.length === 1 && locList[0]?.id) {
        setLocationId(String(locList[0].id));
      }
    } else {
      setParts([]);
      setLocations([]);
    }

    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function updateRow(itemId: string, patch: Partial<UiItem>): void {
    if (!selectedRequestId) return;
    setItemsByRequest((prev) => {
      const list = prev[selectedRequestId] ?? [];
      return {
        ...prev,
        [selectedRequestId]: list.map((x) => (x.id === itemId ? ({ ...x, ...patch } as UiItem) : x)),
      };
    });
  }

  function stageAddToLine(itemId: string): void {
    const it = rows.find((x) => x.id === itemId);
    if (!it) return;

    const partId = it.ui_part_id;
    const qty = toNum(it.ui_qty, 0);
    const price = it.ui_price;

    if (!partId) {
      toast.error("Pick a stock part first.");
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

    updateRow(itemId, { ui_added: true });
  }

  function unstage(itemId: string): void {
    updateRow(itemId, { ui_added: false });
  }

  async function addItem(): Promise<void> {
    if (!selectedReq) {
      toast.error("Select a request first.");
      return;
    }

    setAddingItem(true);
    try {
      const lineId = resolveWorkOrderLineId(selectedReq, rows);

      const insertPayload: DB["public"]["Tables"]["part_request_items"]["Insert"] = {
        request_id: selectedReq.id,
        work_order_line_id: lineId,
        description: "",
        qty: 1,
        quoted_price: null,
        vendor: null,
        part_id: null,
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

      const ui: UiItem = {
        ...data,
        ui_added: false,
        ui_part_id: data.part_id ?? null,
        ui_qty: toNum(data.qty, 1),
        ui_price: data.quoted_price == null ? undefined : toNum(data.quoted_price, 0),
      };

      setItemsByRequest((prev) => {
        const list = prev[selectedReq.id] ?? [];
        return { ...prev, [selectedReq.id]: [...list, ui] };
      });
    } finally {
      setAddingItem(false);
    }
  }

  async function deleteLine(itemId: string): Promise<void> {
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

    if (!selectedRequestId) return;
    setItemsByRequest((prev) => {
      const list = prev[selectedRequestId] ?? [];
      return { ...prev, [selectedRequestId]: list.filter((x) => x.id !== itemId) };
    });

    toast.success("Item removed.");
  }

  async function markQuotedSelected(): Promise<void> {
    if (!selectedReq) return;

    const lineId = resolveWorkOrderLineId(selectedReq, rows);
    if (!lineId) {
      toast.error("Missing work order line id for this request.");
      return;
    }

    if (!locationId) {
      toast.error("Select a stock location first.");
      return;
    }

    if (!stagedValid) {
      toast.error("Stage at least one valid row (Add to line) before quoting.");
      return;
    }

    setQuoting(true);
    try {
      const stagedRows = rows.filter((r) => r.ui_added);

      // 1) Persist ONLY staged items (one save)
      for (const it of stagedRows) {
        const partId = it.ui_part_id;
        const qty = toNum(it.ui_qty, 1);
        const price = it.ui_price;

        if (!partId || price == null) continue;

        const part = parts.find((p) => String(p.id) === partId);
        const desc = (part?.name ?? it.description ?? "").trim();

        const { error } = await supabase
          .from("part_request_items")
          .update({
            part_id: partId,
            description: desc || it.description || "Part",
            qty,
            quoted_price: price,
            vendor: null,
            markup_pct: null,
            work_order_line_id: it.work_order_line_id ?? lineId,
          })
          .eq("id", it.id);

        if (error) {
          toast.error(error.message);
          return;
        }
      }

      // 2) Allocate inventory + stock move for ONLY staged items
      for (const it of stagedRows) {
        const { error } = await supabase.rpc("upsert_part_allocation_from_request_item", {
          p_request_item_id: it.id,
          p_location_id: locationId,
          p_create_stock_move: true,
        });

        if (error) {
          toast.error(error.message);
          return;
        }
      }

      // 3) Set THIS request status => quoted
      const { error: statusErr } = await supabase.rpc("set_part_request_status", {
        p_request: selectedReq.id,
        p_status: "quoted" satisfies Status,
      });

      if (statusErr) {
        toast.error(statusErr.message);
        return;
      }

      // 4) Update WO line status (quoted/pending)
      const { error: wolErr } = await supabase
        .from("work_order_lines")
        .update({
          status: "quoted",
          approval_state: "pending",
          hold_reason: "Parts quote ready – awaiting customer approval",
        } as DB["public"]["Tables"]["work_order_lines"]["Update"])
        .eq("id", lineId);

      if (wolErr) {
        toast.error(`Quoted, but WO line update failed: ${wolErr.message}`);
        return;
      }

      // 5) Sync quote totals (only staged rows total)
      const stagedTotal = stagedRows.reduce((sum, it) => {
        const qty = toNum(it.ui_qty, 0);
        const price = it.ui_price ?? 0;
        return sum + qty * price;
      }, 0);

      if (selectedReq.work_order_id) {
        const { error: quoteErr } = await supabase
          .from("work_order_quote_lines")
          .update({
            stage: "advisor_pending",
            parts_total: stagedTotal,
            grand_total: stagedTotal,
          } as QuoteUpdate)
          .match({
            work_order_id: selectedReq.work_order_id,
            work_order_line_id: lineId,
          });

        if (quoteErr) toast.warning(`WO quote totals not synced: ${quoteErr.message}`);
      }

      // 6) Menu save (best-effort)
      try {
        const res = await fetch("/api/menu-items/upsert-from-line", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workOrderLineId: lineId }),
        });

        const j = (await res.json().catch(() => null)) as UpsertResponse | null;

        if (!res.ok || !j?.ok) {
          toast.warning(j?.detail || j?.error || "Quoted, but couldn’t save to menu items.");
        }
      } catch {
        toast.warning("Quoted, but couldn’t save to menu items (network error).");
      }

      // local UI refresh
      toast.success("Request marked as quoted.");
      window.dispatchEvent(new Event("parts-request:submitted"));
      void load();
    } finally {
      setQuoting(false);
    }
  }

  const woLabel = wo?.custom_id || (wo?.id ? `#${wo.id.slice(0, 8)}` : "—");

  return (
    <div className="w-full bg-background px-3 py-6 text-foreground sm:px-6 lg:px-10 xl:px-16">
      <div className="mb-4 flex items-center justify-between gap-2">
        <button className={BTN_GHOST} onClick={() => router.back()}>
          ← Back
        </button>
      </div>

      {loading ? (
        <div className={`${CARD} p-4 text-sm text-muted-foreground`}>Loading…</div>
      ) : !wo ? (
        <div className={`${CARD} p-4 text-sm text-red-200`}>Work order not found.</div>
      ) : (
        <div className="space-y-4">
          {/* header */}
          <div className={`${CARD} p-4`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xl font-semibold text-foreground">Work Order {woLabel}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Parts requests: {requests.length}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="text-xs text-muted-foreground">Stock location</div>
                <select
                  className="rounded-lg border border-white/12 bg-muted/70 px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-white/10"
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  disabled={quoting || locations.length === 0}
                >
                  <option value="">— select —</option>
                  {locations.map((l) => (
                    <option key={String(l.id)} value={String(l.id)}>
                      {l.code ? `${l.code} — ${l.name}` : l.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* split: request list + editor */}
          <div className="grid gap-4 lg:grid-cols-3">
            {/* left: requests list */}
            <div className={`${CARD} p-4`}>
              <div className="text-sm font-semibold text-foreground">Requests</div>
              <div className="mt-2 space-y-2">
                {requests.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No requests for this work order.</div>
                ) : (
                  requests.map((r) => {
                    const isSelected = r.id === selectedRequestId;
                    const pill = (r.status ?? "requested") === "quoted" ? PILL_QUOTED : PILL_NEEDS;
                    const reqItems = itemsByRequest[r.id] ?? [];
                    const itemCount = reqItems.length;

                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setSelectedRequestId(r.id)}
                        className={[
                          "w-full text-left",
                          "rounded-lg border px-3 py-3",
                          isSelected ? "border-white/18 bg-card/95" : "border-white/10 bg-muted/70 hover:bg-muted/80",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-foreground">
                              Req #{r.id.slice(0, 8)}
                            </div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {itemCount} item{itemCount === 1 ? "" : "s"}
                            </div>
                          </div>
                          <span className={pill}>
                            {(r.status ?? "requested") === "quoted" ? "Quoted" : "Needs quote"}
                          </span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* right: selected request editor */}
            <div className={`${CARD} p-4 lg:col-span-2`}>
              {!selectedReq ? (
                <div className="text-sm text-muted-foreground">Select a request to work on.</div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-lg font-semibold text-foreground">
                        Request #{selectedReq.id.slice(0, 8)}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Status: {selectedReq.status ?? "requested"}{" "}
                        {workOrderLineId ? <span>· Line: {workOrderLineId.slice(0, 8)}</span> : <span>· Line: —</span>}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        className={BTN_GHOST}
                        onClick={() => void addItem()}
                        disabled={addingItem || quoting}
                      >
                        {addingItem ? "Adding…" : "＋ Add part row"}
                      </button>

                      {(selectedReq.status ?? "requested") !== "quoted" && (
                        <button
                          className={BTN_COPPER}
                          onClick={() => void markQuotedSelected()}
                          disabled={quoting || !stagedValid}
                          title={!stagedValid ? "Stage at least one row before quoting" : ""}
                        >
                          {quoting ? "Quoting…" : "Mark Quoted"}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 text-xs text-muted-foreground">
                    Tip: stage only the lines you have pricing for. Unstaged lines stay “requested”.
                  </div>

                  <div className={`${SUBCARD} mt-4 overflow-hidden`}>
                    <table className="w-full text-sm">
                      <thead className="bg-white/5 text-muted-foreground">
                        <tr>
                          <th className="p-3 text-left">Stock part</th>
                          <th className="p-3 text-left">Description</th>
                          <th className="p-3 text-right">Qty</th>
                          <th className="p-3 text-right">Price</th>
                          <th className="p-3 text-right">Total</th>
                          <th className="w-44 p-3" />
                        </tr>
                      </thead>

                      <tbody>
                        {rows.length === 0 ? (
                          <tr className="border-t border-white/10">
                            <td className="p-4 text-sm text-muted-foreground" colSpan={6}>
                              No items yet. Click “Add part row”.
                            </td>
                          </tr>
                        ) : (
                          rows.map((it) => {
                            const locked = it.ui_added || quoting;
                            const qty = toNum(it.ui_qty, 0);
                            const price = it.ui_price ?? 0;
                            const lineTotal = qty > 0 ? price * qty : 0;

                            return (
                              <tr key={String(it.id)} className="border-t border-white/10">
                                <td className="p-3 align-top">
                                  <select
                                    className="w-80 rounded-lg border border-white/12 bg-card/90 px-2 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-white/10 disabled:opacity-50"
                                    value={it.ui_part_id ?? ""}
                                    onChange={(e) => {
                                      const partId = e.target.value || null;
                                      const p = parts.find((x) => String(x.id) === String(partId));
                                      updateRow(String(it.id), {
                                        ui_part_id: partId,
                                        part_id: partId,
                                        description: (p?.name ?? it.description ?? "").trim(),
                                        ui_price: p?.price == null ? undefined : toNum(p.price, 0),
                                        ui_added: false,
                                      });
                                    }}
                                    disabled={locked}
                                  >
                                    <option value="">— select —</option>
                                    {parts.map((p) => (
                                      <option key={String(p.id)} value={String(p.id)}>
                                        {p.sku ? `${p.sku} — ${p.name}` : p.name}
                                      </option>
                                    ))}
                                  </select>
                                </td>

                                <td className="p-3 align-top">
                                  <input
                                    className="w-full rounded-lg border border-white/12 bg-card/90 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-white/10 disabled:opacity-50"
                                    value={it.description ?? ""}
                                    placeholder="Description"
                                    onChange={(e) => updateRow(String(it.id), { description: e.target.value, ui_added: false })}
                                    disabled={locked}
                                  />
                                </td>

                                <td className="p-3 text-right align-top">
                                  <input
                                    type="number"
                                    min={1}
                                    step={1}
                                    className="w-20 rounded-lg border border-white/12 bg-card/90 px-3 py-2 text-right text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-white/10 disabled:opacity-50"
                                    value={Number.isFinite(it.ui_qty) ? String(it.ui_qty) : "1"}
                                    onChange={(e) => {
                                      const raw = e.target.value;
                                      const nextQty = raw === "" ? 1 : Math.max(1, Math.floor(toNum(raw, 1)));
                                      updateRow(String(it.id), { ui_qty: nextQty, ui_added: false });
                                    }}
                                    disabled={locked}
                                  />
                                </td>

                                <td className="p-3 text-right align-top">
                                  <input
                                    type="number"
                                    step={0.01}
                                    className="w-28 rounded-lg border border-white/12 bg-card/90 px-3 py-2 text-right text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-white/10 disabled:opacity-50"
                                    value={it.ui_price == null ? "" : String(it.ui_price)}
                                    onChange={(e) => {
                                      const raw = e.target.value;
                                      updateRow(String(it.id), {
                                        ui_price: raw === "" ? undefined : toNum(raw, 0),
                                        ui_added: false,
                                      });
                                    }}
                                    disabled={locked}
                                  />
                                </td>

                                <td className="p-3 text-right tabular-nums align-top">
                                  {lineTotal.toFixed(2)}
                                </td>

                                <td className="p-3 align-top">
                                  <div className="flex flex-col items-stretch gap-2">
                                    {!it.ui_added ? (
                                      <button
                                        className={BTN_GHOST}
                                        onClick={() => stageAddToLine(String(it.id))}
                                        disabled={quoting}
                                      >
                                        Add to line
                                      </button>
                                    ) : (
                                      <button
                                        className={BTN_COPPER}
                                        onClick={() => unstage(String(it.id))}
                                        disabled={quoting}
                                      >
                                        Added ✓ (undo)
                                      </button>
                                    )}

                                    <button
                                      className={`${BTN} border-red-500/30 bg-red-500/10 text-red-200 hover:bg-red-500/15`}
                                      onClick={() => void deleteLine(String(it.id))}
                                      disabled={quoting}
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

                      <tfoot>
                        <tr className="bg-white/5">
                          <td className="p-3 text-right" colSpan={4}>
                            <span className="text-sm text-muted-foreground">Total (staged parts)</span>
                          </td>
                          <td className="p-3 text-right tabular-nums font-semibold text-[#c88a4d]">
                            {totalSell.toFixed(2)}
                          </td>
                          <td />
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {!stagedValid && rows.length > 0 && (selectedReq.status ?? "requested") !== "quoted" && (
                    <div className="mt-3 text-xs text-muted-foreground">
                      Tip: stage at least one row with <span className="text-[#c88a4d]">Add to line</span>, then press{" "}
                      <span className="text-[#c88a4d]">Mark Quoted</span>.
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}