"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { toast } from "sonner";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type Request = DB["public"]["Tables"]["part_requests"]["Row"];
type Item = DB["public"]["Tables"]["part_request_items"]["Row"] & {
  // schema is catching up
  work_order_line_id?: string | null;
  markup_pct?: number | null;
  qty?: number | null;
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
  const [savedRows, setSavedRows] = useState<Record<string, boolean>>({});
  // per-line manual part inputs
  const [manualParts, setManualParts] = useState<
    Record<string, { name: string; sku: string }>
  >({});

  async function load() {
    setLoading(true);

    // header
    const { data: r, error: rErr } = await supabase
      .from("part_requests")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (rErr) toast.error(rErr.message);
    setReq(r ?? null);

    // items
    const { data: its, error: itErr } = await supabase
      .from("part_request_items")
      .select("*")
      .eq("request_id", id);
    if (itErr) toast.error(itErr.message);
    const itemsList = (its ?? []) as Item[];
    setItems(itemsList);

    // inventory
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

    // markup init
    const m: Record<string, number> = {};
    for (const it of itemsList) {
      m[it.id] =
        typeof it.markup_pct === "number" && !Number.isNaN(it.markup_pct)
          ? it.markup_pct
          : DEFAULT_MARKUP;
    }
    setMarkupPct(m);

    // clear saved flags on fresh load
    setSavedRows({});

    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function getLineIdFromItems(list: Item[]): string | null {
    for (const it of list) {
      if (it.work_order_line_id) return it.work_order_line_id;
    }
    return null;
  }

  async function setStatus(s: Status) {
    const { error } = await supabase.rpc("set_part_request_status", {
      p_request: id,
      p_status: s,
    });
    if (error) {
      toast.error(error.message);
      return;
    }

    if (s === "quoted") {
      const lineId = getLineIdFromItems(items);
      if (lineId) {
        // mark line quoted
        const { error: wolErr } = await supabase
          .from("work_order_lines")
          .update({
            status: "quoted",
          } as DB["public"]["Tables"]["work_order_lines"]["Update"])
          .eq("id", lineId);
        if (wolErr) {
          console.warn("could not set line to quoted:", wolErr.message);
        }

        // save to menu items
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
            console.warn("menu save failed:", j?.error);
            toast.warning("Quoted, but couldn’t save to menu items.");
          } else {
            toast.success("Quoted and saved to menu items.");
          }
        } catch (e) {
          console.warn("menu save error:", e);
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

  async function saveLine(it: Item) {
    const qty =
      typeof it.qty === "number" && !Number.isNaN(it.qty) ? it.qty : null;
    if (!qty || qty <= 0) {
      toast.error("Enter a quantity greater than 0 before saving.");
      return;
    }

    const cost =
      typeof it.quoted_price === "number" && !Number.isNaN(it.quoted_price)
        ? it.quoted_price
        : 0;
    const m = markupPct[it.id] ?? DEFAULT_MARKUP;

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

    setSavedRows((prev) => ({ ...prev, [it.id]: true }));
    toast.success("Line saved");
  }

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
      console.warn("attachPartToItem failed:", error.message);
      toast.error("Cannot attach part — check RLS.");
    } else {
      // change → unsave
      setSavedRows((prev) => ({ ...prev, [itemId]: false }));
      await load();
    }
  }

  // manual: create part in inventory, then attach
  async function createManualPartAndAttach(
    itemId: string,
    name: string,
    sku: string
  ) {
    const item = items.find((x) => x.id === itemId);
    if (!item) return;
    if (!req?.shop_id) {
      toast.error("Cannot create part — missing shop.");
      return;
    }
    if (!name.trim()) {
      toast.error("Enter a name for the part.");
      return;
    }

    // create part in inventory
    const { data: inserted, error } = await supabase
      .from("parts")
      .insert({
        shop_id: req.shop_id,
        name: name.trim(),
        sku: sku.trim() || null,
      })
      .select("*")
      .maybeSingle<Part>();

    if (error) {
      toast.error(error.message);
      return;
    }

    if (!inserted) {
      toast.error("Unable to create part.");
      return;
    }

    // attach to item
    const { error: attachErr } = await supabase
      .from("part_request_items")
      .update({
        part_id: inserted.id,
        description: inserted.name ?? name.trim(),
      })
      .eq("id", itemId);

    if (attachErr) {
      toast.error(attachErr.message);
      return;
    }

    toast.success("Part created and attached.");
    // clear manual fields for that line
    setManualParts((prev) => {
      const copy = { ...prev };
      delete copy[itemId];
      return copy;
    });

    // reload so the new part shows up in the select too
    await load();
  }

  const grandTotals = (() => {
    let sum = 0;
    for (const it of items) {
      const cost =
        typeof it.quoted_price === "number" && !Number.isNaN(it.quoted_price)
          ? it.quoted_price
          : 0;
      const m = markupPct[it.id] ?? DEFAULT_MARKUP;
      const unitSell = cost * (1 + m / 100);
      const qty =
        typeof it.qty === "number" && it.qty > 0 ? Number(it.qty) : 0;
      sum += unitSell * qty;
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
                  const qty =
                    typeof it.qty === "number" && it.qty > 0 ? it.qty : null;
                  const unitSell = cost * (1 + m / 100);
                  const lineTotal = unitSell * (qty ?? 0);
                  const isSaved = savedRows[it.id] === true;

                  const manual = manualParts[it.id] || { name: "", sku: "" };

                  return (
                    <tr
                      key={it.id}
                      className={`border-t border-neutral-800 ${
                        isSaved ? "bg-neutral-900/50 text-neutral-400" : ""
                      }`}
                    >
                      <td className="p-2 align-top">
                        <div className="flex flex-col gap-1">
                          <select
                            className="w-40 rounded border border-neutral-700 bg-neutral-900 p-1 text-xs disabled:opacity-50"
                            value={it.part_id ?? ""}
                            onChange={(e) => {
                              setSavedRows((prev) => ({
                                ...prev,
                                [it.id]: false,
                              }));
                              void attachPartToItem(it.id, e.target.value);
                            }}
                            disabled={isSaved}
                          >
                            <option value="">— select —</option>
                            {parts.map((p) => (
                              <option key={p.id} value={p.id as string}>
                                {p.sku ? `${p.sku} — ${p.name}` : p.name}
                              </option>
                            ))}
                          </select>

                          {/* manual entry */}
                          <div className="flex gap-1">
                            <input
                              className="flex-1 rounded border border-neutral-700 bg-neutral-900 p-1 text-xs disabled:opacity-50"
                              placeholder="Manual part name"
                              value={manual.name}
                              onChange={(e) =>
                                setManualParts((prev) => ({
                                  ...prev,
                                  [it.id]: {
                                    name: e.target.value,
                                    sku: prev[it.id]?.sku ?? "",
                                  },
                                }))
                              }
                              disabled={isSaved}
                            />
                            <input
                              className="w-20 rounded border border-neutral-700 bg-neutral-900 p-1 text-xs disabled:opacity-50"
                              placeholder="SKU"
                              value={manual.sku}
                              onChange={(e) =>
                                setManualParts((prev) => ({
                                  ...prev,
                                  [it.id]: {
                                    name: prev[it.id]?.name ?? "",
                                    sku: e.target.value,
                                  },
                                }))
                              }
                              disabled={isSaved}
                            />
                          </div>
                          <button
                            className="rounded border border-neutral-700 bg-neutral-900 px-2 py-0.5 text-xs hover:bg-neutral-800 disabled:opacity-50"
                            onClick={() =>
                              void createManualPartAndAttach(
                                it.id,
                                manual.name,
                                manual.sku
                              )
                            }
                            disabled={isSaved}
                          >
                            Add & attach
                          </button>
                        </div>
                      </td>
                      <td className="p-2 align-top">{it.description}</td>
                      <td className="p-2 text-right align-top">
                        <input
                          type="number"
                          min={1}
                          step={1}
                          className="w-16 rounded border border-neutral-700 bg-neutral-900 p-1 text-right disabled:opacity-50"
                          value={qty ?? ""} // allow empty
                          onChange={(e) => {
                            const raw = e.target.value;
                            setItems((prev) => {
                              return prev.map((x) => {
                                if (x.id !== it.id) return x;
                                return {
                                  ...x,
                                  qty: raw === "" ? null : Number(raw),
                                } as Item;
                              });
                            });
                            setSavedRows((prev) => ({
                              ...prev,
                              [it.id]: false,
                            }));
                          }}
                          disabled={isSaved}
                        />
                      </td>
                      <td className="p-2 align-top">
                        <input
                          className="w-32 rounded border border-neutral-700 bg-neutral-900 p-1 disabled:opacity-50"
                          value={it.vendor ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            setItems((prev) =>
                              prev.map((x) =>
                                x.id === it.id ? { ...x, vendor: v } : x
                              )
                            );
                            setSavedRows((prev) => ({
                              ...prev,
                              [it.id]: false,
                            }));
                          }}
                          disabled={isSaved}
                        />
                      </td>
                      <td className="p-2 text-right align-top">
                        <input
                          type="number"
                          step={0.01}
                          className="w-24 rounded border border-neutral-700 bg-neutral-900 p-1 text-right disabled:opacity-50"
                          value={cost === 0 ? "" : cost}
                          onChange={(e) => {
                            const raw = e.target.value;
                            const v = raw === "" ? null : Number(raw);
                            setItems((prev) =>
                              prev.map((x) =>
                                x.id === it.id ? { ...x, quoted_price: v } : x
                              )
                            );
                            setSavedRows((prev) => ({
                              ...prev,
                              [it.id]: false,
                            }));
                          }}
                          disabled={isSaved}
                        />
                      </td>
                      <td className="p-2 text-right align-top">
                        <input
                          type="number"
                          step={1}
                          className="w-20 rounded border border-neutral-700 bg-neutral-900 p-1 text-right disabled:opacity-50"
                          value={m}
                          onChange={(e) => {
                            setMarkupPct((prev) => ({
                              ...prev,
                              [it.id]: Math.max(
                                0,
                                Number(e.target.value || DEFAULT_MARKUP)
                              ),
                            }));
                            setSavedRows((prev) => ({
                              ...prev,
                              [it.id]: false,
                            }));
                          }}
                          disabled={isSaved}
                        />
                      </td>
                      <td className="p-2 text-right tabular-nums align-top">
                        {unitSell.toFixed(2)}
                      </td>
                      <td className="p-2 text-right tabular-nums align-top">
                        {lineTotal.toFixed(2)}
                      </td>
                      <td className="p-2 text-right align-top">
                        <button
                          className={`rounded border px-2 py-1 text-xs ${
                            isSaved
                              ? "border-neutral-700 bg-neutral-800/60 text-neutral-300 cursor-default"
                              : "border-neutral-700 hover:bg-neutral-800"
                          }`}
                          onClick={() => !isSaved && void saveLine(it)}
                          disabled={isSaved}
                        >
                          {isSaved ? "Saved" : "Save"}
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
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}