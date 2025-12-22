// app/parts/requests/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
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
  ui_added: boolean; // staged for quote
  ui_part_id: string | null;
  ui_qty: number;
  ui_price?: number; // sell/unit (undefined = not set)
};

type RequestUi = {
  req: RequestRow;
  items: UiItem[];
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function toNum(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
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

function resolveWorkOrderLineId(currentReq: RequestRow, list: UiItem[]): string | null {
  // 1) try any item work_order_line_id
  for (const it of list) {
    if (isNonEmptyString(it.work_order_line_id)) return it.work_order_line_id;
  }

  // 2) in your schema, part_requests.job_id is used as the WO line id
  if (isNonEmptyString(currentReq.job_id)) return currentReq.job_id;

  return null;
}

function computeRequestBadge(req: RequestRow, items: UiItem[]): "needs_quote" | "quoted" {
  const status = (req.status ?? "requested").toLowerCase();
  if (status === "quoted" || status === "approved" || status === "fulfilled") return "quoted";

  // even if request.status says requested, if every row is priced/parted we can show quoted
  const allDone = items.length > 0 && items.every((it) => {
    const hasPart = isNonEmptyString(it.part_id ?? it.ui_part_id ?? null);
    const hasPrice = it.quoted_price != null || it.ui_price != null;
    const qty = toNum(it.qty ?? it.ui_qty, 0);
    return hasPart && hasPrice && qty > 0;
  });

  return allDone ? "quoted" : "needs_quote";
}

export default function PartsRequestsForWorkOrderPage(): JSX.Element {
  const { id: routeId } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [wo, setWo] = useState<WorkOrderRow | null>(null);
  const [requests, setRequests] = useState<RequestUi[]>([]);
  const [parts, setParts] = useState<PartRow[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [locationId, setLocationId] = useState<string>("");

  const [loading, setLoading] = useState<boolean>(true);
  const [savingReqId, setSavingReqId] = useState<string | null>(null);

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
  const inputBase =
    `rounded-lg border bg-neutral-950/40 px-3 py-2 text-sm text-white placeholder:text-neutral-500 border-white/10 focus:outline-none ${COPPER_FOCUS_RING}`;
  const selectBase =
    `rounded-lg border bg-neutral-950/40 px-2 py-2 text-xs text-white border-white/10 focus:outline-none ${COPPER_FOCUS_RING}`;

  const btnBase =
    "inline-flex items-center justify-center rounded-lg border px-3 py-2 text-sm transition disabled:opacity-60";
  const btnGhost = `${btnBase} border-white/10 bg-neutral-950/20 hover:bg-white/5`;
  const btnCopper = `${btnBase} ${COPPER_BORDER} ${COPPER_TEXT} bg-neutral-950/20 ${COPPER_HOVER_BG}`;
  const btnDanger =
    `${btnBase} border-red-900/60 bg-neutral-950/20 text-red-200 hover:bg-red-900/20`;

  const pillBase =
    "inline-flex items-center whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium";
  const pillNeedsQuote = `${pillBase} border-red-500/35 bg-red-950/35 text-red-200`;
  const pillQuoted = `${pillBase} border-teal-500/35 bg-teal-950/25 text-teal-200`;

  async function resolveWorkOrder(idOrCustom: string): Promise<WorkOrderRow | null> {
    const raw = (idOrCustom ?? "").trim();
    if (!raw) return null;

    // by UUID
    if (looksLikeUuid(raw)) {
      const { data, error } = await supabase
        .from("work_orders")
        .select("*")
        .eq("id", raw)
        .maybeSingle();
      if (!error && data) return data as WorkOrderRow;
    }

    // by custom_id exact
    {
      const { data } = await supabase
        .from("work_orders")
        .select("*")
        .eq("custom_id", raw)
        .maybeSingle();
      if (data) return data as WorkOrderRow;
    }

    // by custom_id ilike
    {
      const { data } = await supabase
        .from("work_orders")
        .select("*")
        .ilike("custom_id", raw.toUpperCase())
        .maybeSingle();
      if (data) return data as WorkOrderRow;
    }

    // fallback normalize EL000003 vs EL3
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
          const cid = (r.custom_id ?? "").toUpperCase().replace(/^([A-Z]+)0+/, "$1");
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
      setRequests([]);
      setParts([]);
      setLocations([]);
      setLoading(false);
      return;
    }

    setWo(woRow);

    // load requests for this work order
    const { data: reqs, error: reqErr } = await supabase
      .from("part_requests")
      .select("*")
      .eq("work_order_id", woRow.id)
      .order("created_at", { ascending: false });

    if (reqErr) toast.error(reqErr.message);

    const reqList = (reqs ?? []) as RequestRow[];
    const reqIds = reqList.map((r) => r.id);

    // load items for those requests
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
          const sell = row.quoted_price == null ? undefined : toNum(row.quoted_price, 0);
          return {
            ...row,
            ui_added: false,
            ui_part_id: row.part_id ?? null,
            ui_qty: toNum(row.qty, 1),
            ui_price: sell,
          };
        });

      return { req: r, items: uiItems };
    });

    setRequests(uiRequests);

    // parts + locations (from work order shop id)
    const shopId = woRow.shop_id ?? null;
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
  }, [routeId]);

  function updateItem(reqId: string, itemId: string, patch: Partial<UiItem>): void {
    setRequests((prev) =>
      prev.map((r) => {
        if (r.req.id !== reqId) return r;
        return {
          ...r,
          items: r.items.map((it) => (it.id === itemId ? ({ ...it, ...patch } as UiItem) : it)),
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

      const insertPayload: DB["public"]["Tables"]["part_request_items"]["Insert"] = {
        request_id: target.req.id,
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
        r.req.id === reqId ? { ...r, items: r.items.filter((x) => x.id !== itemId) } : r,
      ),
    );
    toast.success("Item removed.");
  }

  function stageAddToLine(reqId: string, itemId: string): void {
    const target = requests.find((r) => r.req.id === reqId);
    const it = target?.items.find((x) => x.id === itemId);
    if (!it) return;

    const partId = it.ui_part_id;
    const qty = toNum(it.ui_qty, 0);
    const price = it.ui_price;

    // ✅ FIX: no "return toast.error()" inside void function
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

    updateItem(reqId, itemId, { ui_added: true });
  }

  function unstage(reqId: string, itemId: string): void {
    updateItem(reqId, itemId, { ui_added: false });
  }

  function requestTotals(r: RequestUi): { stagedTotal: number; stagedCount: number } {
    let sum = 0;
    let count = 0;
    for (const it of r.items) {
      if (!it.ui_added) continue;
      const qty = toNum(it.ui_qty, 0);
      const price = it.ui_price ?? 0;
      if (qty > 0) {
        sum += price * qty;
        count += 1;
      }
    }
    return { stagedTotal: sum, stagedCount: count };
  }

  function stagedIsValid(r: RequestUi): boolean {
    // allow partial quoting: valid if at least 1 staged row and every staged row is fully filled
    const staged = r.items.filter((it) => it.ui_added);
    if (staged.length === 0) return false;

    return staged.every((it) => {
      const qty = toNum(it.ui_qty, 0);
      return (
        isNonEmptyString(it.ui_part_id) &&
        qty > 0 &&
        it.ui_price != null &&
        Number.isFinite(it.ui_price)
      );
    });
  }

  async function markQuotedForRequest(reqId: string): Promise<void> {
    const target = requests.find((r) => r.req.id === reqId);
    if (!target) return;

    if (!locationId) {
      toast.error("Select a stock location first.");
      return;
    }

    if (!stagedIsValid(target)) {
      toast.error("Stage at least one valid row before quoting.");
      return;
    }

    const lineId = resolveWorkOrderLineId(target.req, target.items);

    setSavingReqId(reqId);
    try {
      const staged = target.items.filter((it) => it.ui_added);

      // 1) Persist staged items only
      for (const it of staged) {
        const partId = it.ui_part_id;
        const qty = toNum(it.ui_qty, 1);
        const price = it.ui_price;

        if (!partId || price == null) {
          toast.error("Some staged rows are missing a part or price.");
          return;
        }

        const part = parts.find((p) => String(p.id) === partId);
        const desc = (part?.name ?? it.description ?? "").trim();

        const { error } = await supabase
          .from("part_request_items")
          .update({
            part_id: partId,
            description: desc || it.description || "Part",
            qty,
            quoted_price: price, // sell price
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

      // 2) Allocate inventory + stock move (only staged)
      for (const it of staged) {
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

      // 3) Decide if request can become quoted (all items completed)
      // Refresh local interpretation: items with part_id + quoted_price
      const after = target.items.map((it) => {
        if (!it.ui_added) return it;
        return {
          ...it,
          part_id: it.ui_part_id,
          quoted_price: it.ui_price ?? null,
          ui_added: false, // clear stage after quote
        };
      });

      const allNowQuoted =
        after.length > 0 &&
        after.every((it) => {
          const hasPart = isNonEmptyString(it.part_id ?? it.ui_part_id ?? null);
          const hasPrice = it.quoted_price != null || it.ui_price != null;
          const qty = toNum(it.qty ?? it.ui_qty, 0);
          return hasPart && hasPrice && qty > 0;
        });

      if (allNowQuoted) {
        const { error: statusErr } = await supabase.rpc("set_part_request_status", {
          p_request: reqId,
          p_status: "quoted" satisfies Status,
        });

        if (statusErr) {
          toast.error(statusErr.message);
          return;
        }
      }

      // 4) Update WO line status + quote totals + menu save (only if we have a line id)
      if (!lineId) {
        toast.success(allNowQuoted ? "Request quoted." : "Staged rows quoted (request still needs more).");
        // update local state and exit
        setRequests((prev) =>
          prev.map((r) => {
            if (r.req.id !== reqId) return r;
            return {
              req: { ...r.req, status: allNowQuoted ? "quoted" : (r.req.status ?? "requested") },
              items: after,
            };
          }),
        );
        window.dispatchEvent(new Event("parts-request:submitted"));
        return;
      }

      const { error: wolErr } = await supabase
        .from("work_order_lines")
        .update({
          status: "quoted",
          approval_state: "pending",
          hold_reason: "Parts quote ready – awaiting customer approval",
        } as DB["public"]["Tables"]["work_order_lines"]["Update"])
        .eq("id", lineId);

      if (wolErr) {
        toast.warning(`Quoted, but WO line update failed: ${wolErr.message}`);
      }

      // totals for this request (staged total)
      const { stagedTotal } = requestTotals({ req: target.req, items: staged });

      if (target.req.work_order_id) {
        const { error: quoteErr } = await supabase
          .from("work_order_quote_lines")
          .update({
            stage: "advisor_pending",
            parts_total: stagedTotal,
            grand_total: stagedTotal,
          } as QuoteUpdate)
          .match({
            work_order_id: target.req.work_order_id,
            work_order_line_id: lineId,
          });

        if (quoteErr) toast.warning(`WO quote totals not synced: ${quoteErr.message}`);
      }

      try {
        const res = await fetch("/api/menu-items/upsert-from-line", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workOrderLineId: lineId }),
        });

        const j = (await res.json().catch(() => null)) as UpsertResponse | null;

        if (!res.ok || !j?.ok) {
          const msg =
            j?.detail ||
            j?.error ||
            "Quoted, but couldn’t save to menu items (see server logs / RLS).";
          toast.warning(msg);
        } else {
          toast.success(`Quoted and ${j.updated ? "updated" : "saved"} to menu items.`);
        }
      } catch (e) {
        const msg =
          e instanceof Error
            ? `Quoted, but couldn’t save to menu items: ${e.message}`
            : "Quoted, but couldn’t save to menu items (network error).";
        toast.warning(msg);
      }

      // update local state
      setRequests((prev) =>
        prev.map((r) => {
          if (r.req.id !== reqId) return r;
          return {
            req: { ...r.req, status: allNowQuoted ? "quoted" : (r.req.status ?? "requested") },
            items: after,
          };
        }),
      );

      window.dispatchEvent(new Event("parts-request:submitted"));
      toast.success(allNowQuoted ? "Request quoted." : "Staged rows quoted (request still needs more).");
    } finally {
      setSavingReqId(null);
    }
  }

  const woDisplay = wo?.custom_id || (wo?.id ? `#${wo.id.slice(0, 8)}` : null);

  return (
    <div className={pageWrap}>
      <button className={btnGhost} onClick={() => router.back()}>
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
                    Work Order{" "}
                    <span className={COPPER_TEXT}>{woDisplay}</span>
                  </div>
                  <div className="mt-1 text-sm text-neutral-400">
                    Parts requests for this work order.
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-xs text-neutral-400">Stock location</div>
                  <select
                    className={`${selectBase} w-64`}
                    value={locationId}
                    onChange={(e) => setLocationId(e.target.value)}
                    disabled={!!savingReqId || locations.length === 0}
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

              <div className="mt-3 text-xs text-neutral-400">
                Stage rows you have pricing for, then quote that request. Requests stay{" "}
                <span className={COPPER_TEXT_SOFT}>requested</span> until all rows are fully quoted.
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
                const { stagedTotal, stagedCount } = requestTotals(r);

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
                            Line:{" "}
                            {resolveWorkOrderLineId(r.req, r.items)?.slice(0, 8) ?? "—"}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span className={badge === "needs_quote" ? pillNeedsQuote : pillQuoted}>
                            {badge === "needs_quote" ? "Needs quote" : "Quoted"}
                          </span>

                          <button
                            className={btnGhost}
                            onClick={() => void addRow(r.req.id)}
                            disabled={busy}
                          >
                            {busy ? "Working…" : "＋ Add part row"}
                          </button>

                          <button
                            className={btnCopper}
                            onClick={() => void markQuotedForRequest(r.req.id)}
                            disabled={busy || !locationId || !stagedIsValid(r)}
                            title={!locationId ? "Select a stock location first" : ""}
                          >
                            {busy ? "Saving…" : "Quote staged"}
                          </button>
                        </div>
                      </div>

                      <div className="mt-3 text-xs text-neutral-400">
                        Staged:{" "}
                        <span className={COPPER_TEXT_SOFT}>{stagedCount}</span>{" "}
                        row{stagedCount === 1 ? "" : "s"} · Total{" "}
                        <span className={COPPER_TEXT_SOFT}>
                          {stagedTotal.toFixed(2)}
                        </span>
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
                              <th className="p-3 text-right">Line total</th>
                              <th className="w-48 p-3" />
                            </tr>
                          </thead>

                          <tbody>
                            {r.items.length === 0 ? (
                              <tr className="border-t border-white/10">
                                <td className="p-4 text-sm text-neutral-500" colSpan={6}>
                                  No items yet. Click “Add part row”.
                                </td>
                              </tr>
                            ) : (
                              r.items.map((it) => {
                                const locked = busy; // allow editing even if staged; only lock while saving
                                const qty = toNum(it.ui_qty, 0);
                                const price = it.ui_price ?? 0;
                                const lineTotal = qty > 0 ? price * qty : 0;

                                return (
                                  <tr key={String(it.id)} className="border-t border-white/10">
                                    <td className="p-3 align-top">
                                      <select
                                        className={`${selectBase} w-80`}
                                        value={it.ui_part_id ?? ""}
                                        onChange={(e) => {
                                          const partId = e.target.value || null;
                                          const p = parts.find((x) => String(x.id) === String(partId));
                                          updateItem(r.req.id, String(it.id), {
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
                                        className={`${inputBase} w-full py-2 text-xs`}
                                        value={it.description ?? ""}
                                        placeholder="Description"
                                        onChange={(e) =>
                                          updateItem(r.req.id, String(it.id), {
                                            description: e.target.value,
                                            ui_added: false,
                                          })
                                        }
                                        disabled={locked}
                                      />
                                    </td>

                                    <td className="p-3 text-right align-top">
                                      <input
                                        type="number"
                                        min={1}
                                        step={1}
                                        className={`${inputBase} w-20 py-2 text-right text-xs`}
                                        value={Number.isFinite(it.ui_qty) ? String(it.ui_qty) : "1"}
                                        onChange={(e) => {
                                          const raw = e.target.value;
                                          const nextQty =
                                            raw === "" ? 1 : Math.max(1, Math.floor(toNum(raw, 1)));
                                          updateItem(r.req.id, String(it.id), {
                                            ui_qty: nextQty,
                                            ui_added: false,
                                          });
                                        }}
                                        disabled={locked}
                                      />
                                    </td>

                                    <td className="p-3 text-right align-top">
                                      <input
                                        type="number"
                                        step={0.01}
                                        className={`${inputBase} w-28 py-2 text-right text-xs`}
                                        value={it.ui_price == null ? "" : String(it.ui_price)}
                                        onChange={(e) => {
                                          const raw = e.target.value;
                                          updateItem(r.req.id, String(it.id), {
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
                                            className={`${btnGhost} py-2 text-xs`}
                                            onClick={() => stageAddToLine(r.req.id, String(it.id))}
                                            disabled={busy}
                                          >
                                            Stage
                                          </button>
                                        ) : (
                                          <button
                                            className={`${btnCopper} py-2 text-xs`}
                                            onClick={() => unstage(r.req.id, String(it.id))}
                                            disabled={busy}
                                          >
                                            Staged ✓ (undo)
                                          </button>
                                        )}

                                        <button
                                          className={`${btnDanger} py-2 text-xs`}
                                          onClick={() => void deleteLine(r.req.id, String(it.id))}
                                          disabled={busy}
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

                      {!stagedIsValid(r) && r.items.length > 0 && (
                        <div className="mt-3 text-xs text-neutral-500">
                          Tip: stage at least one row with a part, qty, and price, then press{" "}
                          <span className={COPPER_TEXT_SOFT}>Quote staged</span>.
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
    </div>
  );
}