"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { toast } from "sonner";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type Request = DB["public"]["Tables"]["part_requests"]["Row"];
type Item = DB["public"]["Tables"]["part_request_items"]["Row"] & {
  // TS safety while schema propagates
  work_order_line_id?: string | null;
  markup_pct?: number | null;
};
type Status = Request["status"];
type Part = DB["public"]["Tables"]["parts"]["Row"];

const DEFAULT_MARKUP = 30; // %

export default function PartsRequestDetail() {
  const { id } = useParams<{ id: string }>();
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const router = useRouter();

  const [req, setReq] = useState<Request | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [parts, setParts] = useState<Part[]>([]);
  const [markupPct, setMarkupPct] = useState<Record<string, number>>({});

  async function load() {
    setLoading(true);

    // 1) header
    const { data: r, error: rErr } = await supabase
      .from("part_requests")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (rErr) {
      toast.error(rErr.message);
    }
    setReq(r ?? null);

    // 2) items
    const { data: its, error: itErr } = await supabase
      .from("part_request_items")
      .select("*")
      .eq("request_id", id);
    if (itErr) {
      toast.error(itErr.message);
    }
    const itemsList = (its ?? []) as Item[];
    setItems(itemsList);

    // 3) inventory for this shop
    if (r?.shop_id) {
      const { data: ps } = await supabase
        .from("parts")
        .select("*")
        .eq("shop_id", r.shop_id)
        .order("name")
        .limit(500);
      setParts(ps ?? []);
    } else {
      setParts([]);
    }

    // 4) init per-line markup from DB if present
    const m: Record<string, number> = {};
    for (const it of itemsList) {
      m[it.id] =
        typeof it.markup_pct === "number" && !Number.isNaN(it.markup_pct)
          ? it.markup_pct
          : DEFAULT_MARKUP;
    }
    setMarkupPct(m);

    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // pull a line id from any of the items (they should all point to same line)
  function getLineIdFromItems(list: Item[]): string | null {
    for (const it of list) {
      if (it.work_order_line_id) return it.work_order_line_id;
    }
    return null;
  }

  async function setStatus(s: Status) {
    // 1) update request status
    const { error } = await supabase.rpc("set_part_request_status", {
      p_request: id,
      p_status: s,
    });
    if (error) {
      toast.error(error.message);
      return;
    }

    // 2) if quoted, try to update WO line + save menu item
    if (s === "quoted") {
      const lineId = getLineIdFromItems(items);
      if (lineId) {
        // mark the line quoted
        const { error: wolErr } = await supabase
          .from("work_order_lines")
          .update({ status: "quoted" } as DB["public"]["Tables"]["work_order_lines"]["Update"])
          .eq("id", lineId);
        if (wolErr) {
          console.warn("[parts request detail] unable to mark line quoted:", wolErr.message);
        }

        // attempt to save to menu items
        try {
          const res = await fetch("/api/menu-items/save-from-line", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workOrderLineId: lineId }),
          });
          const j = (await res.json().catch(() => null)) as {
            ok?: boolean;
            error?: string;
          } | null;
          if (!res.ok) {
            console.warn("[parts request detail] menu save failed:", j?.error);
            toast.warning("Quoted, but couldn’t save to menu items.");
          } else {
            toast.success("Quoted and saved to menu items.");
          }
        } catch (e) {
          console.warn("[parts request detail] menu save error:", e);
          toast.warning("Quoted, but couldn’t save to menu items.");
        }
      } else {
        toast.success("Parts request marked as quoted.");
      }
    } else {
      toast.success(`Parts request marked as ${s}.`);
    }

    await load();
  }

  // save vendor + cost + qty + markup directly on the table
  async function saveLine(it: Item) {
    const cost =
      typeof it.quoted_price === "number" && !Number.isNaN(it.quoted_price)
        ? it.quoted_price
        : 0;
    const m = markupPct[it.id] ?? DEFAULT_MARKUP;
    const qty = it.qty ?? 1;

    const { error } = await supabase
      .from("part_request_items")
      .update({
        vendor: it.vendor ?? null,
        quoted_price: cost,
        qty,
        markup_pct: m,
      })
      .eq("id", it.id);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Line saved");
    await load();
  }

  // attach inventory part
  async function attachPartToItem(itemId: string, partId: string) {
    const p = parts.find((x) => x.id === partId);
    const desc = p?.name ?? "Part";

    const { error } = await supabase
      .from("part_request_items")
      .update({
        part_id: partId,
        description: desc,
      })
      .eq("id", itemId);

    if (error) {
      console.warn("attachPartToItem failed (likely RLS):", error.message);
      toast.error("Cannot attach part — check RLS.");
    } else {
      await load();
    }
  }

  const grandTotals = (() => {
    let sum = 0;
    for (const it of items) {
      const cost =
        typeof it.quoted_price === "number" && !Number.isNaN(it.quoted_price)
          ? it.quoted_price
          : 0;
      const m = markupPct[it.id] ?? DEFAULT_MARKUP;
      const sell = cost * (1 + m / 100);
      sum += sell * Number(it.qty || 0);
    }
    return sum;
  })();

  return (
    <div className="p-6 text-white space-y-4">
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
          {/* header */}
          <div className="rounded border border-neutral-800 bg-neutral-900 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xl font-semibold">
                  Request #{req.id.slice(0, 8)}
                </div>
                <div className="text-sm text-neutral-400">
                  WO: {req.work_order_id ?? "—"} ·{" "}
                  {req.created_at
                    ? new Date(req.created_at).toLocaleString()
                    : "—"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-neutral-300 capitalize">
                  Status: {req.status}
                </span>
                {req.status !== "approved" && (
                  <button
                    className="rounded border border-blue-600 text-blue-300 px-3 py-1.5 text-sm hover:bg-blue-900/20"
                    onClick={() => void setStatus("approved")}
                  >
                    Mark Approved
                  </button>
                )}
                {req.status !== "quoted" && (
                  <button
                    className="rounded border border-orange-500 px-3 py-1.5 text-sm hover:bg-orange-500/10"
                    onClick={() => void setStatus("quoted")}
                  >
                    Mark Quoted
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* table */}
          <div className="rounded border border-neutral-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-neutral-900 text-neutral-400">
                <tr>
                  <th className="p-2 text-left">Inventory</th>
                  <th className="p-2 text-left">Description</th>
                  <th className="p-2 text-right">Qty</th>
                  <th className="p-2 text-left">Vendor</th>
                  <th className="p-2 text-right">Cost (unit)</th>
                  <th className="p-2 text-right">Markup %</th>
                  <th className="p-2 text-right">Sell (unit)</th>
                  <th className="p-2 text-right">Line total</th>
                  <th className="p-2 w-28"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const cost =
                    typeof it.quoted_price === "number" &&
                    !Number.isNaN(it.quoted_price)
                      ? it.quoted_price
                      : 0;
                  const m = markupPct[it.id] ?? DEFAULT_MARKUP;
                  const qty = it.qty ?? 1;
                  const sell = cost * (1 + m / 100);
                  const lineTotal = sell * qty;

                  return (
                    <tr key={it.id} className="border-t border-neutral-800">
                      <td className="p-2">
                        <select
                          className="w-40 rounded border border-neutral-700 bg-neutral-900 p-1 text-xs"
                          value={it.part_id ?? ""}
                          onChange={(e) =>
                            void attachPartToItem(it.id, e.target.value)
                          }
                        >
                          <option value="">— select —</option>
                          {parts.map((p) => (
                            <option key={p.id} value={p.id as string}>
                              {p.sku ? `${p.sku} — ${p.name}` : p.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2">{it.description}</td>
                      <td className="p-2 text-right">
                        <input
                          type="number"
                          min={1}
                          step={1}
                          className="w-16 rounded border border-neutral-700 bg-neutral-900 p-1 text-right"
                          value={qty}
                          onChange={(e) => {
                            const v = Math.max(1, Number(e.target.value) || 1);
                            setItems((prev) =>
                              prev.map((x) =>
                                x.id === it.id ? { ...x, qty: v } : x
                              )
                            );
                          }}
                        />
                      </td>
                      <td className="p-2">
                        <input
                          className="w-32 rounded border border-neutral-700 bg-neutral-900 p-1"
                          value={it.vendor ?? ""}
                          onChange={(e) =>
                            setItems((prev) =>
                              prev.map((x) =>
                                x.id === it.id
                                  ? { ...x, vendor: e.target.value }
                                  : x
                              )
                            )
                          }
                        />
                      </td>
                      <td className="p-2 text-right">
                        <input
                          type="number"
                          step={0.01}
                          className="w-24 rounded border border-neutral-700 bg-neutral-900 p-1 text-right"
                          value={cost === 0 ? "" : cost}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const v = raw === "" ? null : Number(raw);
                            setItems((prev) =>
                              prev.map((x) =>
                                x.id === it.id
                                  ? { ...x, quoted_price: v }
                                  : x
                              )
                            );
                          }}
                        />
                      </td>
                      <td className="p-2 text-right">
                        <input
                          type="number"
                          step={1}
                          className="w-20 rounded border border-neutral-700 bg-neutral-900 p-1 text-right"
                          value={m}
                          onChange={(e) =>
                            setMarkupPct((prev) => ({
                              ...prev,
                              [it.id]: Math.max(
                                0,
                                Number(e.target.value || DEFAULT_MARKUP)
                              ),
                            }))
                          }
                        />
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {sell.toFixed(2)}
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {lineTotal.toFixed(2)}
                      </td>
                      <td className="p-2 text-right">
                        <button
                          className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
                          onClick={() => void saveLine(it)}
                        >
                          Save
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-neutral-900/50">
                  <td className="p-2 text-right" colSpan={7}>
                    <span className="text-sm text-neutral-300">
                      Total (with markup)
                    </span>
                  </td>
                  <td className="p-2 text-right tabular-nums font-semibold">
                    {grandTotals.toFixed(2)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}