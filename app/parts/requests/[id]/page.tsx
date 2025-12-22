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

function isRowComplete(it: UiItem): boolean {
  const hasPart = isNonEmptyString(it.part_id ?? it.ui_part_id ?? null);
  const hasPrice = it.quoted_price != null || it.ui_price != null;
  const qty = toNum(it.qty ?? it.ui_qty, 0);
  return hasPart && hasPrice && qty > 0;
}

function computeRequestBadge(req: RequestRow, items: UiItem[]): "needs_quote" | "quoted" {
  const status = (req.status ?? "requested").toLowerCase();
  if (status === "quoted" || status === "approved" || status === "fulfilled") return "quoted";
  const allDone = items.length > 0 && items.every((it) => isRowComplete(it));
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
  const [defaultLocationId, setDefaultLocationId] = useState<string>("");

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
      setDefaultLocationId("");
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
          const sell = row.quoted_price == null ? undefined : toNum(row.quoted_price, 0);
          return {
            ...row,
            ui_part_id: row.part_id ?? null,
            ui_qty: toNum(row.qty, 1),
            ui_price: sell,
            ui_added: false,
          };
        });

      return { req: r, items: uiItems };
    });

    setRequests(uiRequests);

    // parts + locations (we auto-pick the first location so user never selects)
    const shopId = woRow.shop_id ?? null;
    if (shopId) {
      const [{ data: ps }, { data: locs }] = await Promise.all([
        supabase.from("parts").select("*").eq("shop_id", shopId).order("name").limit(1000),
        supabase.from("stock_locations").select("*").eq("shop_id", shopId).order("code"),
      ]);

      setParts((ps ?? []) as PartRow[]);

      const locList = (locs ?? []) as LocationRow[];
      setLocations(locList);

      // 🔑 default location (no UI step)
      if (locList.length > 0) {
        const first = locList[0]?.id ? String(locList[0].id) : "";
        setDefaultLocationId(first);
      } else {
        setDefaultLocationId("");
      }
    } else {
      setParts([]);
      setLocations([]);
      setDefaultLocationId("");
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
        ui_part_id: data.part_id ?? null,
        ui_qty: toNum(data.qty, 1),
        ui_price: data.quoted_price == null ? undefined : toNum(data.quoted_price, 0),
        ui_added: false,
      };

      setRequests((prev) =>
        prev.map((r) => (r.req.id === reqId ? { ...r, items: [...r.items, ui] } : r)),
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
      toast.error("Missing work order line id for this request.");
      return;
    }

    // We keep inventory allocation working, but remove the UI step:
    // - we auto-pick the first location (if any)
    // - if none exist, we still save the request item but cannot allocate inventory
    const locId = defaultLocationId || "";

    setSavingReqId(reqId);
    try {
      const part = parts.find((p) => String(p.id) === partId);
      const desc = (part?.name ?? it.description ?? "").trim();

      // 1) persist the item immediately
      const { error: updErr } = await supabase
        .from("part_request_items")
        .update({
          part_id: partId,
          description: desc || it.description || "Part",
          qty,
          quoted_price: price,
          vendor: null,
          markup_pct: null,
          work_order_line_id: it.work_order_line_id ?? lineId,
        } as DB["public"]["Tables"]["part_request_items"]["Update"])
        .eq("id", it.id);

      if (updErr) {
        toast.error(updErr.message);
        return;
      }

      // 2) allocate (only if we have a location)
      if (locId) {
        const { error } = await supabase.rpc("upsert_part_allocation_from_request_item", {
          p_request_item_id: it.id,
          p_location_id: locId,
          p_create_stock_move: true,
        });

        if (error) {
          toast.error(error.message);
          return;
        }
      } else {
        toast.warning("No stock location exists for this shop. Item saved, but inventory was not allocated.");
      }

      // 3) update local state so badge flips immediately
      setRequests((prev) =>
        prev.map((r) => {
          if (r.req.id !== reqId) return r;

          const nextItems = r.items.map((x) => {
            if (x.id !== itemId) return x;
            return {
              ...x,
              part_id: partId,
              quoted_price: price,
              qty,
              ui_added: true,
            } as UiItem;
          });

          const allNowQuoted = nextItems.length > 0 && nextItems.every((x) => isRowComplete(x));

          return {
            req: {
              ...r.req,
              status: allNowQuoted ? "quoted" : (r.req.status ?? "requested"),
            },
            items: nextItems,
          };
        }),
      );

      // 4) if all rows complete, mark request quoted in DB
      {
        const refreshed = requests.find((r) => r.req.id === reqId);
        const localItems = refreshed?.items ?? [];
        const optimistic = localItems.map((x) =>
          x.id === itemId
            ? ({ ...x, part_id: partId, quoted_price: price, qty } as UiItem)
            : x,
        );

        const allNowQuoted = optimistic.length > 0 && optimistic.every((x) => isRowComplete(x));
        if (allNowQuoted) {
          const { error: statusErr } = await supabase.rpc("set_part_request_status", {
            p_request: reqId,
            p_status: "quoted" satisfies Status,
          });
          if (statusErr) {
            toast.warning(statusErr.message);
          }
        }
      }

      // 5) tell WO page to refresh + redraw parts used
      window.dispatchEvent(new Event("parts-request:submitted"));
      window.dispatchEvent(new Event("wo:parts-used"));

      // 6) best-effort: save to menu items (keeps your catalog in sync)
      try {
        const res = await fetch("/api/menu-items/upsert-from-line", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workOrderLineId: lineId }),
        });

        const j = (await res.json().catch(() => null)) as UpsertResponse | null;

        if (!res.ok || !j?.ok) {
          toast.warning(j?.detail || j?.error || "Added, but couldn’t save to menu items.");
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
                    Work Order <span className={COPPER_TEXT}>{woDisplay}</span>
                  </div>
                  <div className="mt-1 text-sm text-neutral-400">
                    Parts requests for this work order.
                  </div>
                </div>

                {/* Stock location selector removed (auto-picked internally) */}
              </div>

              <div className="mt-3 text-xs text-neutral-400">
                Add parts to attach them to the work order line. The request becomes{" "}
                <span className={COPPER_TEXT_SOFT}>quoted</span> automatically once every row has a part + qty + price.
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

                return (
                  <div key={r.req.id} className={`${glassCard} overflow-hidden`}>
                    <div className={`${glassHeader} px-5 py-4`}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold">
                            Request <span className={COPPER_TEXT}>#{r.req.id.slice(0, 8)}</span>
                          </div>
                          <div className="mt-1 text-xs text-neutral-400">
                            Created{" "}
                            {r.req.created_at ? new Date(r.req.created_at).toLocaleString() : "—"}
                            <span className="mx-2 text-neutral-600">·</span>
                            Line: {resolveWorkOrderLineId(r.req, r.items)?.slice(0, 8) ?? "—"}
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
                                const locked = busy;
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
                                            description: (p?.name ?? it.description ?? "").trim(),
                                            ui_price: p?.price == null ? undefined : toNum(p.price, 0),
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
                                          updateItem(r.req.id, String(it.id), { description: e.target.value })
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
                                          updateItem(r.req.id, String(it.id), { ui_qty: nextQty });
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
                                        <button
                                          className={`${btnCopper} py-2 text-xs`}
                                          onClick={() => void addAndAttach(r.req.id, String(it.id))}
                                          disabled={busy}
                                        >
                                          {busy ? "Saving…" : "Add"}
                                        </button>

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

                      {locations.length === 0 && (
                        <div className="mt-3 text-xs text-neutral-500">
                          No stock locations exist for this shop, so inventory allocation is skipped.
                          Parts will still be saved to the request item.
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