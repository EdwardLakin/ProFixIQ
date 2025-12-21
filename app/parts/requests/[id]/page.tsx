// app/parts/requests/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { toast } from "sonner";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

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
  ui_added: boolean; // staged/locked for quote
  ui_part_id: string | null;
  ui_qty: number;
  ui_price: number | null; // sell/unit
};

function toNum(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export default function PartsRequestDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [req, setReq] = useState<RequestRow | null>(null);
  const [rows, setRows] = useState<UiItem[]>([]);
  const [parts, setParts] = useState<PartRow[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [locationId, setLocationId] = useState<string>("");

  const [loading, setLoading] = useState(true);
  const [addingItem, setAddingItem] = useState(false);
  const [quoting, setQuoting] = useState(false);

  const workOrderLineId = useMemo(() => {
    for (const it of rows) {
      if (it.work_order_line_id) return it.work_order_line_id;
    }
    return null;
  }, [rows]);

  async function load() {
    setLoading(true);

    const { data: r, error: rErr } = await supabase
      .from("part_requests")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (rErr) toast.error(rErr.message);
    setReq(r ?? null);

    const { data: its, error: itErr } = await supabase
      .from("part_request_items")
      .select("*")
      .eq("request_id", id)
      .order("id", { ascending: true });

    if (itErr) toast.error(itErr.message);

    const itemRows = (its ?? []) as ItemRow[];
    const ui: UiItem[] = itemRows.map((row) => ({
      ...row,
      ui_added: false,
      ui_part_id: row.part_id ?? null,
      ui_qty: toNum(row.qty, 1),
      ui_price: row.quoted_price == null ? null : toNum(row.quoted_price, 0),
    }));
    setRows(ui);

    if (r?.shop_id) {
      const [{ data: ps }, { data: locs }] = await Promise.all([
        supabase.from("parts").select("*").eq("shop_id", r.shop_id).order("name").limit(1000),
        supabase.from("stock_locations").select("*").eq("shop_id", r.shop_id).order("code"),
      ]);

      setParts((ps ?? []) as PartRow[]);
      const locList = (locs ?? []) as LocationRow[];
      setLocations(locList);

      // Auto-pick if only one location, or if none selected yet.
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

  async function addItem() {
    if (!req) {
      toast.error("Request not loaded yet.");
      return;
    }

    setAddingItem(true);
    try {
      const insertPayload: DB["public"]["Tables"]["part_request_items"]["Insert"] = {
        request_id: req.id,
        work_order_line_id: workOrderLineId ?? null,
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
        ui_price: data.quoted_price == null ? null : toNum(data.quoted_price, 0),
      };

      setRows((prev) => [...prev, ui]);
    } finally {
      setAddingItem(false);
    }
  }

  async function deleteLine(itemId: string) {
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

    setRows((prev) => prev.filter((x) => x.id !== itemId));
    toast.success("Item removed.");
  }

  function updateRow(itemId: string, patch: Partial<UiItem>) {
    setRows((prev) => prev.map((x) => (x.id === itemId ? ({ ...x, ...patch } as UiItem) : x)));
  }

  function stageAddToLine(itemId: string) {
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

  function unstage(itemId: string) {
    updateRow(itemId, { ui_added: false });
  }

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

  const allAdded = useMemo(() => {
    if (rows.length === 0) return false;
    return rows.every((it) => it.ui_added && !!it.ui_part_id && toNum(it.ui_qty, 0) > 0 && it.ui_price != null);
  }, [rows]);

  async function markQuoted() {
    if (!req) return;

    if (!workOrderLineId) {
      toast.error("Missing work order line id for this request.");
      return;
    }

    // If you’re allocating inventory / creating stock moves, location is required.
    if (!locationId) {
      toast.error("Select a stock location first.");
      return;
    }

    if (!allAdded) {
      toast.error("Add all parts to the line before quoting.");
      return;
    }

    setQuoting(true);
    try {
      // 1) Persist all items (ONE SAVE: on Quote)
      for (const it of rows) {
        const partId = it.ui_part_id;
        const qty = toNum(it.ui_qty, 1);
        const price = it.ui_price;

        if (!partId || price == null) {
          toast.error("Some rows are missing a part or price.");
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
            // Store SELL price here (your WO side only needs description/qty/price)
            quoted_price: price,
            vendor: null,
            markup_pct: null,
          })
          .eq("id", it.id);

        if (error) {
          toast.error(error.message);
          return;
        }
      }

      // 2) Allocate inventory + stock move (idempotent per source_request_item_id)
      for (const it of rows) {
        const { error } = await supabase.rpc("upsert_part_allocation_from_request_item", {
          p_request_item_id: it.id,
          p_location_id: locationId,
          p_create_stock_move: true,
        });

        if (error) {
          // This is where INSUFFICIENT_STOCK will show up
          toast.error(error.message);
          return;
        }
      }

      // 3) Set request status => quoted
      const { error: statusErr } = await supabase.rpc("set_part_request_status", {
        p_request: id,
        p_status: "quoted" satisfies Status,
      });

      if (statusErr) {
        toast.error(statusErr.message);
        return;
      }

      // 4) Update WO line status so WO UI reflects it
      const { error: wolErr } = await supabase
        .from("work_order_lines")
        .update({
          status: "quoted",
          approval_state: "pending",
          hold_reason: "Parts quote ready – awaiting customer approval",
        } as DB["public"]["Tables"]["work_order_lines"]["Update"])
        .eq("id", workOrderLineId);

      if (wolErr) {
        toast.error(`Quoted, but WO line update failed: ${wolErr.message}`);
        return;
      }

      // 5) Sync quote totals (sell total)
      if (req.work_order_id) {
        const { error: quoteErr } = await supabase
          .from("work_order_quote_lines")
          .update({
            stage: "advisor_pending",
            parts_total: totalSell,
            grand_total: totalSell,
          } as QuoteUpdate)
          .match({
            work_order_id: req.work_order_id,
            work_order_line_id: workOrderLineId,
          });

        if (quoteErr) toast.warning(`WO quote totals not synced: ${quoteErr.message}`);
      }

      // 6) Menu save (best-effort)
      try {
        const res = await fetch("/api/menu-items/upsert-from-line", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workOrderLineId }),
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

      // 7) Notify WO page listeners
      window.dispatchEvent(new Event("parts-request:submitted"));

      toast.success("Parts request marked as quoted.");
      router.back();
    } finally {
      setQuoting(false);
    }
  }

  return (
    <div className="space-y-4 p-6 text-white">
      <button
        className="rounded border border-neutral-700 px-2 py-1 text-sm hover:bg-neutral-800"
        onClick={() => router.back()}
      >
        ← Back
      </button>

      {loading || !req ? (
        <div className="rounded border border-neutral-800 bg-neutral-900 p-3 text-neutral-400">
          Loading…
        </div>
      ) : (
        <>
          <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xl font-semibold">Request #{req.id.slice(0, 8)}</div>
                <div className="text-sm text-neutral-400">
                  WO: {req.work_order_id ?? "—"} ·{" "}
                  {req.created_at ? new Date(req.created_at).toLocaleString() : "—"}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-neutral-700 bg-neutral-950 px-3 py-1 text-xs capitalize text-neutral-200">
                  Status: {req.status ?? "requested"}
                </span>

                <button
                  className="rounded border border-neutral-600 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-100 hover:bg-neutral-800 disabled:opacity-60"
                  onClick={() => void addItem()}
                  disabled={addingItem || quoting}
                >
                  {addingItem ? "Adding…" : "＋ Add part row"}
                </button>

                {req.status !== "quoted" && (
                  <button
                    className="rounded border border-orange-500 px-3 py-1.5 text-sm text-orange-300 hover:bg-orange-500/10 disabled:opacity-60"
                    onClick={() => void markQuoted()}
                    disabled={quoting || !allAdded}
                    title={!allAdded ? "Add all parts to line first" : ""}
                  >
                    {quoting ? "Quoting…" : "Mark Quoted"}
                  </button>
                )}
              </div>
            </div>

            <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="text-xs text-neutral-400">
                Add parts from stock, lock them to the line, then press <span className="text-neutral-200">Mark Quoted</span>{" "}
                once.
              </div>

              <div className="flex items-center gap-2">
                <div className="text-xs text-neutral-400">Stock location</div>
                <select
                  className="w-56 rounded border border-neutral-700 bg-neutral-900 p-1 text-xs disabled:opacity-50"
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

          <div className="overflow-hidden rounded border border-neutral-800">
            <table className="w-full text-sm">
              <thead className="bg-neutral-900 text-neutral-400">
                <tr>
                  <th className="p-2 text-left">Stock part</th>
                  <th className="p-2 text-left">Description</th>
                  <th className="p-2 text-right">Qty</th>
                  <th className="p-2 text-right">Price (unit)</th>
                  <th className="p-2 text-right">Line total</th>
                  <th className="w-40 p-2" />
                </tr>
              </thead>

              <tbody>
                {rows.length === 0 ? (
                  <tr className="border-t border-neutral-800">
                    <td className="p-3 text-sm text-neutral-500" colSpan={6}>
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
                      <tr key={String(it.id)} className="border-t border-neutral-800">
                        <td className="p-2 align-top">
                          <select
                            className="w-72 rounded border border-neutral-700 bg-neutral-900 p-1 text-xs disabled:opacity-50"
                            value={it.ui_part_id ?? ""}
                            onChange={(e) => {
                              const partId = e.target.value || null;
                              const p = parts.find((x) => String(x.id) === String(partId));
                              updateRow(String(it.id), {
                                ui_part_id: partId,
                                part_id: partId,
                                description: (p?.name ?? it.description ?? "").trim(),
                                // Default price from stock part (sell price)
                                ui_price: p?.price == null ? null : toNum(p.price, 0),
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

                        <td className="p-2 align-top">
                          <input
                            className="w-full rounded border border-neutral-700 bg-neutral-900 p-1 text-xs disabled:opacity-50"
                            value={it.description ?? ""}
                            placeholder="Description"
                            onChange={(e) => updateRow(String(it.id), { description: e.target.value, ui_added: false })}
                            disabled={locked}
                          />
                        </td>

                        <td className="p-2 text-right align-top">
                          <input
                            type="number"
                            min={1}
                            step={1}
                            className="w-16 rounded border border-neutral-700 bg-neutral-900 p-1 text-right disabled:opacity-50"
                            value={Number.isFinite(it.ui_qty) ? String(it.ui_qty) : "1"}
                            onChange={(e) => {
                              const raw = e.target.value;
                              const nextQty = raw === "" ? 1 : Math.max(1, Math.floor(toNum(raw, 1)));
                              updateRow(String(it.id), { ui_qty: nextQty, ui_added: false });
                            }}
                            disabled={locked}
                          />
                        </td>

                        <td className="p-2 text-right align-top">
                          <input
                            type="number"
                            step={0.01}
                            className="w-24 rounded border border-neutral-700 bg-neutral-900 p-1 text-right disabled:opacity-50"
                            value={it.ui_price == null ? "" : String(it.ui_price)}
                            onChange={(e) => {
                              const raw = e.target.value;
                              updateRow(String(it.id), {
                                ui_price: raw === "" ? null : toNum(raw, 0),
                                ui_added: false,
                              });
                            }}
                            disabled={locked}
                          />
                        </td>

                        <td className="p-2 text-right tabular-nums align-top">{lineTotal.toFixed(2)}</td>

                        <td className="p-2 align-top">
                          <div className="flex flex-col items-stretch gap-1">
                            {!it.ui_added ? (
                              <button
                                className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800 disabled:opacity-60"
                                onClick={() => stageAddToLine(String(it.id))}
                                disabled={quoting}
                              >
                                Add to line
                              </button>
                            ) : (
                              <button
                                className="rounded border border-orange-500 px-2 py-1 text-xs text-orange-300 hover:bg-orange-500/10 disabled:opacity-60"
                                onClick={() => unstage(String(it.id))}
                                disabled={quoting}
                              >
                                Added ✓ (undo)
                              </button>
                            )}

                            <button
                              className="rounded border border-red-700 px-2 py-1 text-xs text-red-200 hover:bg-red-900/40 disabled:opacity-60"
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
                <tr className="bg-neutral-900/50">
                  <td className="p-2 text-right" colSpan={4}>
                    <span className="text-sm text-neutral-300">Total (added parts)</span>
                  </td>
                  <td className="p-2 text-right tabular-nums font-semibold">{totalSell.toFixed(2)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {!allAdded && rows.length > 0 && req.status !== "quoted" && (
            <div className="text-xs text-neutral-500">
              Tip: Click <span className="text-neutral-200">Add to line</span> on every row, then press{" "}
              <span className="text-neutral-200">Mark Quoted</span>.
            </div>
          )}
        </>
      )}
    </div>
  );
}