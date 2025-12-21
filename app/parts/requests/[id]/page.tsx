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
type QuoteUpdate = DB["public"]["Tables"]["work_order_quote_lines"]["Update"];
type StockLocation = DB["public"]["Tables"]["stock_locations"]["Row"];

const DEFAULT_MARKUP = 30; // %

type UpsertResponse = {
  ok: boolean;
  menuItemId?: string;
  updated?: boolean;
  error?: string;
  detail?: string;
};

type RpcUpsertAllocArgs = {
  p_request_item_id: string;
  p_location_id: string;
  p_create_stock_move: boolean;
};

export default function PartsRequestDetail() {
  const { id } = useParams<{ id: string }>();
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const router = useRouter();

  const [req, setReq] = useState<Request | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  const [addingItem, setAddingItem] = useState(false);
  const [parts, setParts] = useState<Part[]>([]);
  const [markupPct, setMarkupPct] = useState<Record<string, number>>({});
  const [savedRows, setSavedRows] = useState<Record<string, boolean>>({});
  const [manualParts, setManualParts] = useState<
    Record<string, { name: string; sku: string }>
  >({});

  // ✅ NEW: stock locations + allocation state (drives “Parts Used”)
  const [locations, setLocations] = useState<StockLocation[]>([]);
  const [locationId, setLocationId] = useState<string>("");
  const [allocByRequestItemId, setAllocByRequestItemId] = useState<
    Record<string, { allocation_id: string; stock_move_id: string | null }>
  >({});
  const [allocating, setAllocating] = useState(false);

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
      .eq("request_id", id);

    if (itErr) toast.error(itErr.message);
    const itemsList = (its ?? []) as Item[];
    setItems(itemsList);

    // inventory
    if (r?.shop_id) {
      const [{ data: ps }, { data: locs, error: locErr }] = await Promise.all([
        supabase
          .from("parts")
          .select("*")
          .eq("shop_id", r.shop_id)
          .order("name")
          .limit(500),
        supabase
          .from("stock_locations")
          .select("id, shop_id, code, name")
          .eq("shop_id", r.shop_id)
          .order("name"),
      ]);

      setParts(ps ?? []);
      setLocations((locs ?? []) as StockLocation[]);

      if (locErr) {
        // eslint-disable-next-line no-console
        console.warn("load stock_locations failed:", locErr.message);
      }

      // default the location if not chosen
      const locList = (locs ?? []) as StockLocation[];
      if (!locationId) {
        if (locList.length === 1) {
          setLocationId(locList[0].id as string);
        } else if (locList.length > 1) {
          // keep empty to force a deliberate selection
          setLocationId("");
        }
      } else {
        // if previously selected location disappeared, reset
        const stillExists = locList.some((l) => l.id === locationId);
        if (!stillExists) setLocationId("");
      }
    } else {
      setParts([]);
      setLocations([]);
      setLocationId("");
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

    // ✅ allocation lookup so UI reflects “Parts Used”
    if (itemsList.length) {
      const itemIds = itemsList.map((x) => x.id);
      const { data: allocs, error: aErr } = await supabase
        .from("work_order_part_allocations")
        .select("id, source_request_item_id, stock_move_id")
        .in("source_request_item_id", itemIds);

      if (aErr) {
        // eslint-disable-next-line no-console
        console.warn("load allocations failed:", aErr.message);
        setAllocByRequestItemId({});
      } else {
        const map: Record<
          string,
          { allocation_id: string; stock_move_id: string | null }
        > = {};
        (allocs ?? []).forEach((a) => {
          const src = (a as any).source_request_item_id as string | null;
          if (!src) return;
          map[src] = {
            allocation_id: (a as any).id as string,
            stock_move_id: ((a as any).stock_move_id as string | null) ?? null,
          };
        });
        setAllocByRequestItemId(map);
      }
    } else {
      setAllocByRequestItemId({});
    }

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

  async function addItem() {
    if (!req) {
      toast.error("Request not loaded yet.");
      return;
    }
    setAddingItem(true);
    try {
      const lineId = getLineIdFromItems(items);

      const insertPayload: DB["public"]["Tables"]["part_request_items"]["Insert"] =
        {
          request_id: req.id,
          work_order_line_id: lineId ?? null,
          description: "",
          qty: 1,
          quoted_price: 0,
          vendor: null,
        };

      const { data, error } = await supabase
        .from("part_request_items")
        .insert(insertPayload)
        .select("*")
        .maybeSingle<Item>();

      if (error) {
        toast.error(error.message);
        return;
      }
      if (!data) {
        toast.error("Could not create a new item.");
        return;
      }

      setItems((prev) => [...prev, data]);
      setMarkupPct((prev) => ({ ...prev, [data.id]: DEFAULT_MARKUP }));
      setSavedRows((prev) => ({ ...prev, [data.id]: false }));
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

    setItems((prev) => prev.filter((it) => it.id !== itemId));
    setMarkupPct((prev) => {
      const copy = { ...prev };
      delete copy[itemId];
      return copy;
    });
    setSavedRows((prev) => {
      const copy = { ...prev };
      delete copy[itemId];
      return copy;
    });
    setManualParts((prev) => {
      const copy = { ...prev };
      delete copy[itemId];
      return copy;
    });
    setAllocByRequestItemId((prev) => {
      const copy = { ...prev };
      delete copy[itemId];
      return copy;
    });

    toast.success("Item removed.");
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

      if (!lineId) {
        toast.success("Parts request marked as quoted.");
        await load();
        window.dispatchEvent(new Event("parts-request:submitted"));
        return;
      }

      // 1) update the WO line so WO UI reflects it
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
        await load();
        return;
      }

      // 2) sync quote totals (best-effort)
      if (req?.work_order_id) {
        let partsTotalForLine = 0;

        for (const it of items) {
          if (it.work_order_line_id !== lineId) continue;

          const cost =
            typeof it.quoted_price === "number" && !Number.isNaN(it.quoted_price)
              ? it.quoted_price
              : 0;

          const m = markupPct[it.id] ?? DEFAULT_MARKUP;
          const unitSell = cost * (1 + m / 100);

          const qty = typeof it.qty === "number" && it.qty > 0 ? Number(it.qty) : 0;

          partsTotalForLine += unitSell * qty;
        }

        const { error: quoteErr } = await supabase
          .from("work_order_quote_lines")
          .update({
            stage: "advisor_pending",
            parts_total: partsTotalForLine,
            grand_total: partsTotalForLine,
          } as QuoteUpdate)
          .match({
            work_order_id: req.work_order_id,
            work_order_line_id: lineId,
          });

        if (quoteErr) {
          toast.warning(`WO quote totals not synced: ${quoteErr.message}`);
        }
      }

      // 3) menu save best-effort
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

      // 4) force WO refresh
      window.dispatchEvent(new Event("parts-request:submitted"));

      toast.success("Parts request marked as quoted.");
      await load();
      return;
    }

    toast.success(`Parts request marked as ${String(s)}.`);
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
        description: (it.description ?? "").trim(),
        part_id: it.part_id ?? null,
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
    // allow detach
    if (!partId) {
      const { error } = await supabase
        .from("part_request_items")
        .update({ part_id: null })
        .eq("id", itemId);

      if (error) toast.error(error.message);
      setSavedRows((prev) => ({ ...prev, [itemId]: false }));
      await load();
      return;
    }

    const p = parts.find((x) => x.id === partId);
    const desc = p?.name ?? "";

    const { error } = await supabase
      .from("part_request_items")
      .update({
        part_id: partId,
        description: desc,
      })
      .eq("id", itemId);

    if (error) {
      toast.error("Cannot attach part — check RLS.");
      return;
    }

    // selecting stock part = manual fields no longer needed
    setManualParts((prev) => {
      const copy = { ...prev };
      delete copy[itemId];
      return copy;
    });

    setSavedRows((prev) => ({ ...prev, [itemId]: false }));
    await load();
  }

  async function createManualPartAndAttach(itemId: string, name: string, sku: string) {
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
    setManualParts((prev) => {
      const copy = { ...prev };
      delete copy[itemId];
      return copy;
    });

    await load();
  }

  // ✅ NEW: convert request item -> allocation (drives Parts Used)
  async function allocateOne(requestItemId: string) {
    if (!locationId) {
      toast.error("Select a stock location first.");
      return;
    }

    const already = allocByRequestItemId[requestItemId];
    if (already?.allocation_id) {
      toast.message("Already allocated from this request item.");
      return;
    }

    const { data, error } = await supabase.rpc(
      "upsert_part_allocation_from_request_item",
      {
        p_request_item_id: requestItemId,
        p_location_id: locationId,
        p_create_stock_move: true,
      } as RpcUpsertAllocArgs,
    );

    if (error) {
      // surface function-raised messages like INSUFFICIENT_STOCK
      toast.error(error.message);
      return;
    }

    const allocId = typeof data === "string" ? data : null;
    if (!allocId) {
      toast.error("Allocation not created (no id returned).");
      return;
    }

    // nudge WO page to refresh Parts Used immediately
    window.dispatchEvent(new Event("wo:parts-used"));
    window.dispatchEvent(new Event("parts-request:submitted"));
    toast.success("Allocated to work order.");
    await load();
  }

  async function allocateAllEligible() {
    if (!locationId) {
      toast.error("Select a stock location first.");
      return;
    }

    const eligible = items.filter((it) => {
      if (!it.id) return false;
      if (!it.part_id) return false;
      if (!it.work_order_line_id) return false;
      if (allocByRequestItemId[it.id]?.allocation_id) return false;
      return true;
    });

    if (eligible.length === 0) {
      toast.message("No eligible items to allocate.");
      return;
    }

    setAllocating(true);
    try {
      for (const it of eligible) {
        const { data, error } = await supabase.rpc(
          "upsert_part_allocation_from_request_item",
          {
            p_request_item_id: it.id as string,
            p_location_id: locationId,
            p_create_stock_move: true,
          } as RpcUpsertAllocArgs,
        );

        if (error) {
          // stop on first failure so inventory state is clear
          toast.error(`${it.description || "Item"}: ${error.message}`);
          return;
        }

        const allocId = typeof data === "string" ? data : null;
        if (!allocId) {
          toast.error(`${it.description || "Item"}: allocation did not return an id.`);
          return;
        }
      }

      window.dispatchEvent(new Event("wo:parts-used"));
      window.dispatchEvent(new Event("parts-request:submitted"));
      toast.success("Allocated eligible items.");
      await load();
    } finally {
      setAllocating(false);
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
      const unitSell = cost * (1 + m / 100);
      const qty = typeof it.qty === "number" && it.qty > 0 ? Number(it.qty) : 0;
      sum += unitSell * qty;
    }
    return sum;
  })();

  const eligibleCount = items.filter((it) => {
    if (!it.id) return false;
    if (!it.part_id) return false;
    if (!it.work_order_line_id) return false;
    if (allocByRequestItemId[it.id]?.allocation_id) return false;
    return true;
  }).length;

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
                  Status: {req.status}
                </span>

                {/* ✅ only quoting happens here */}
                {req.status !== "quoted" && (
                  <button
                    className="rounded border border-orange-500 px-3 py-1.5 text-sm text-orange-300 hover:bg-orange-500/10"
                    onClick={() => void setStatus("quoted")}
                  >
                    Mark Quoted
                  </button>
                )}
              </div>
            </div>

            {/* ✅ NEW: allocate controls */}
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-neutral-800 pt-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-400">Stock location</span>
                <select
                  className="min-w-[220px] rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-white"
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                >
                  <option value="">— select location —</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id as string}>
                      {l.code ? `${l.code} — ${l.name}` : l.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                className="rounded border border-blue-600 px-3 py-1.5 text-xs font-semibold text-blue-200 hover:bg-blue-900/20 disabled:opacity-60"
                onClick={() => void allocateAllEligible()}
                disabled={allocating || !locationId || eligibleCount === 0}
                title="Convert request items into Parts Used allocations (updates WO Parts Used + stock)"
              >
                {allocating ? "Allocating…" : `Allocate eligible (${eligibleCount})`}
              </button>

              <span className="text-[11px] text-neutral-500">
                Allocations drive the Work Order “Parts used” section.
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-200">Items in this request</h2>
              <button
                type="button"
                className="inline-flex items-center rounded border border-neutral-600 bg-neutral-900 px-3 py-1.5 text-xs font-medium text-neutral-100 hover:bg-neutral-800 disabled:opacity-60"
                onClick={() => void addItem()}
                disabled={addingItem}
              >
                {addingItem ? "Adding…" : "＋ Add item"}
              </button>
            </div>

            <div className="overflow-hidden rounded border border-neutral-800">
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
                    <th className="w-40 p-2" />
                  </tr>
                </thead>

                <tbody>
                  {items.map((it) => {
                    const cost =
                      typeof it.quoted_price === "number" && !Number.isNaN(it.quoted_price)
                        ? it.quoted_price
                        : 0;
                    const m = markupPct[it.id] ?? DEFAULT_MARKUP;
                    const qty = typeof it.qty === "number" && it.qty > 0 ? it.qty : null;
                    const unitSell = cost * (1 + m / 100);
                    const lineTotal = unitSell * (qty ?? 0);
                    const isSaved = savedRows[it.id] === true;

                    const manual = manualParts[it.id] || { name: "", sku: "" };
                    const hasStockPart = !!it.part_id;

                    const alloc = allocByRequestItemId[it.id];
                    const isAllocated = !!alloc?.allocation_id;

                    const canAllocate =
                      !!locationId &&
                      !!it.part_id &&
                      !!it.work_order_line_id &&
                      !isAllocated;

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
                                setSavedRows((prev) => ({ ...prev, [it.id]: false }));
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

                            {/* ✅ Manual entry only if NO stock part selected */}
                            {!hasStockPart && (
                              <>
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
                                    void createManualPartAndAttach(it.id, manual.name, manual.sku)
                                  }
                                  disabled={isSaved}
                                >
                                  Add & attach
                                </button>
                              </>
                            )}

                            {/* ✅ Allocation status */}
                            {isAllocated ? (
                              <div className="inline-flex items-center gap-2 text-[11px]">
                                <span className="rounded-full border border-emerald-700/60 bg-emerald-900/20 px-2 py-0.5 font-semibold text-emerald-200">
                                  Allocated
                                </span>
                                {alloc?.stock_move_id ? (
                                  <span className="text-neutral-500">Stock moved</span>
                                ) : (
                                  <span className="text-neutral-500">No stock move</span>
                                )}
                              </div>
                            ) : null}
                          </div>
                        </td>

                        <td className="p-2 align-top">
                          <input
                            className="w-full rounded border border-neutral-700 bg-neutral-900 p-1 text-xs disabled:opacity-50"
                            value={it.description ?? ""}
                            placeholder="Description"
                            onChange={(e) => {
                              const v = e.target.value;
                              setItems((prev) =>
                                prev.map((x) =>
                                  x.id === it.id ? ({ ...x, description: v } as Item) : x,
                                ),
                              );
                              setSavedRows((prev) => ({ ...prev, [it.id]: false }));
                            }}
                            disabled={isSaved}
                          />
                        </td>

                        <td className="p-2 text-right align-top">
                          <input
                            type="number"
                            min={1}
                            step={1}
                            className="w-16 rounded border border-neutral-700 bg-neutral-900 p-1 text-right disabled:opacity-50"
                            value={qty ?? ""}
                            onChange={(e) => {
                              const raw = e.target.value;
                              setItems((prev) =>
                                prev.map((x) =>
                                  x.id === it.id
                                    ? ({ ...x, qty: raw === "" ? null : Number(raw) } as Item)
                                    : x,
                                ),
                              );
                              setSavedRows((prev) => ({ ...prev, [it.id]: false }));
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
                                prev.map((x) => (x.id === it.id ? { ...x, vendor: v } : x)),
                              );
                              setSavedRows((prev) => ({ ...prev, [it.id]: false }));
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
                                  x.id === it.id ? ({ ...x, quoted_price: v } as Item) : x,
                                ),
                              );
                              setSavedRows((prev) => ({ ...prev, [it.id]: false }));
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
                                [it.id]: Math.max(0, Number(e.target.value || DEFAULT_MARKUP)),
                              }));
                              setSavedRows((prev) => ({ ...prev, [it.id]: false }));
                            }}
                            disabled={isSaved}
                          />
                        </td>

                        <td className="p-2 text-right tabular-nums align-top">{unitSell.toFixed(2)}</td>
                        <td className="p-2 text-right tabular-nums align-top">{lineTotal.toFixed(2)}</td>

                        <td className="p-2 align-top">
                          <div className="flex flex-col items-stretch gap-1">
                            <button
                              className={`rounded border px-2 py-1 text-xs ${
                                isSaved
                                  ? "cursor-default border-neutral-700 bg-neutral-800/60 text-neutral-300"
                                  : "border-neutral-700 hover:bg-neutral-800"
                              }`}
                              onClick={() => !isSaved && void saveLine(it)}
                              disabled={isSaved}
                            >
                              {isSaved ? "Saved" : "Save"}
                            </button>

                            <button
                              className="rounded border border-red-700 px-2 py-1 text-xs text-red-200 hover:bg-red-900/40"
                              onClick={() => void deleteLine(it.id as string)}
                            >
                              Delete
                            </button>

                            <button
                              className={`rounded border px-2 py-1 text-xs ${
                                canAllocate
                                  ? "border-emerald-600 text-emerald-200 hover:bg-emerald-900/20"
                                  : "border-neutral-700 text-neutral-400 opacity-70"
                              }`}
                              onClick={() => void allocateOne(it.id as string)}
                              disabled={!canAllocate || allocating}
                              title={
                                !it.part_id
                                  ? "Select an inventory part to allocate"
                                  : !it.work_order_line_id
                                  ? "This request item isn't linked to a work order line"
                                  : !locationId
                                  ? "Select a stock location"
                                  : isAllocated
                                  ? "Already allocated"
                                  : "Allocate this item to the work order (Parts Used)"
                              }
                            >
                              {isAllocated ? "Allocated" : "Allocate to WO"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                <tfoot>
                  <tr className="bg-neutral-900/50">
                    <td className="p-2 text-right" colSpan={7}>
                      <span className="text-sm text-neutral-300">Total (with markup)</span>
                    </td>
                    <td className="p-2 text-right tabular-nums font-semibold">{grandTotals.toFixed(2)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}