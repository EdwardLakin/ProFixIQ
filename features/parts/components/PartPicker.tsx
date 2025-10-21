"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type PartRow = DB["public"]["Tables"]["parts"]["Row"];
type StockLoc = DB["public"]["Tables"]["stock_locations"]["Row"];
type VStock = {
  part_id: string;
  location_id: string;
  qty_available: number;
  qty_on_hand: number;
  qty_reserved: number;
};

export type PickedPart = { part_id: string; location_id?: string; qty: number };

type PartPickerProps = {
  open: boolean;
  /** Optional direct callback (in addition to event emission). */
  onClose?: () => void;
  /** Optional direct callback (in addition to event emission). */
  onPick?: (sel: PickedPart) => void;
  /** Window event channel: emits `${channel}:close` & `${channel}:pick`. */
  channel?: string;
  /** Initial search term when opened. */
  initialSearch?: string;
};

/**
 * PartPicker
 * - Event-based modal picker that can ALSO call optional props callbacks.
 * - Emits: `${channel}:close` and `${channel}:pick` (detail: PickedPart)
 */
export function PartPicker({
  open,
  onClose,
  onPick,
  channel = "partpicker",
  initialSearch = "",
}: PartPickerProps) {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [shopId, setShopId] = useState<string>("");
  const [search, setSearch] = useState(initialSearch);
  const [parts, setParts] = useState<PartRow[]>([]);
  const [stock, setStock] = useState<Record<string, VStock[]>>({});
  const [locs, setLocs] = useState<StockLoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // selection state
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [selectedLocId, setSelectedLocId] = useState<string | null>(null);
  const [qty, setQty] = useState<number>(1);

  // derive MAIN location if present
  const mainLocId = useMemo(() => {
    const m = locs.find((l) => l.code?.toUpperCase() === "MAIN");
    return m?.id ?? null;
  }, [locs]);

  // get user shop + locations
  useEffect(() => {
    if (!open) return;
    (async () => {
      setErr(null);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const { data: prof } = await supabase
          .from("profiles")
          .select("shop_id")
          .eq("user_id", user.id)
          .single();
        const sid = prof?.shop_id ?? "";
        setShopId(sid);
        if (!sid) return;

        const { data: locsData, error: locErr } = await supabase
          .from("stock_locations")
          .select("id, code, name, shop_id")
          .eq("shop_id", sid)
          .order("code");
        if (locErr) throw locErr;
        setLocs(locsData ?? []);
      } catch (e: any) {
        setErr(e?.message ?? "Failed to init picker");
      }
    })();
  }, [open, supabase]);

  // search parts
  useEffect(() => {
    if (!open || !shopId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        let q = supabase.from("parts").select("*").eq("shop_id", shopId).order("name").limit(50);
        const term = search.trim();
        if (term) q = q.or(`name.ilike.%${term}%,sku.ilike.%${term}%,category.ilike.%${term}%`);

        const { data: rows, error } = await q;
        if (error) throw error;
        if (cancelled) return;

        setParts(rows ?? []);

        // fetch stock for these parts
        const ids = (rows ?? []).map((r) => r.id);
        if (ids.length) {
          const { data: vs } = await supabase
            .from("v_part_stock")
            .select("part_id, location_id, qty_available, qty_on_hand, qty_reserved")
            .in("part_id", ids);
          const grouped: Record<string, VStock[]> = {};
          (vs ?? []).forEach((s) => {
            if (!grouped[s.part_id]) grouped[s.part_id] = [];
            grouped[s.part_id].push(s as VStock);
          });
          setStock(grouped);
        } else {
          setStock({});
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? "Search failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, shopId, search, supabase]);

  // reset when reopening
  useEffect(() => {
    if (!open) return;
    setSelectedPartId(null);
    setSelectedLocId(null);
    setQty(1);
    setSearch(initialSearch);
  }, [open, initialSearch]);

  if (!open) return null;

  const selectedStocks = selectedPartId ? stock[selectedPartId] ?? [] : [];
  const locMap = new Map(locs.map((l) => [l.id, l]));
  const defaultLocId = selectedLocId ?? mainLocId ?? selectedStocks[0]?.location_id ?? null;

  // helpers to emit window events and also call optional callbacks
  const emit = (name: "close" | "pick", detail?: unknown) => {
    const ev = new CustomEvent(`${channel}:${name}`, { detail });
    window.dispatchEvent(ev);
  };
  const handleClose = () => {
    emit("close");
    onClose?.();
  };
  const handlePick = (payload: PickedPart) => {
    emit("pick", payload);
    onPick?.(payload);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-3xl rounded-2xl bg-white p-4 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-xs text-neutral-500">Select a part</div>
            <h3 className="text-lg font-semibold">Part Picker</h3>
          </div>
          <button
            onClick={handleClose}
            className="rounded border px-2 py-1 text-sm text-neutral-600 hover:bg-neutral-50"
          >
            Close
          </button>
        </div>

        <div className="mb-3">
          <input
            className="w-full rounded border px-3 py-2"
            placeholder="Search name, SKU, category…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {err && <div className="mb-2 text-sm text-red-600">{err}</div>}
        {loading ? (
          <div className="text-sm text-neutral-500">Searching…</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {/* left: results */}
            <div className="rounded-xl border">
              <div className="border-b p-2 text-sm font-semibold">Results</div>
              <div className="max-h-72 overflow-auto">
                {(parts ?? []).length === 0 ? (
                  <div className="p-3 text-sm text-neutral-500">No parts found.</div>
                ) : (
                  parts.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPartId(p.id)}
                      className={`block w-full text-left px-3 py-2 border-b last:border-b-0 hover:bg-neutral-50 ${
                        selectedPartId === p.id ? "bg-neutral-100" : ""
                      }`}
                    >
                      <div className="font-medium truncate">{p.name}</div>
                      <div className="text-xs text-neutral-500">
                        {p.sku ?? "—"} • {p.category ?? "Uncategorized"}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* right: stock + confirm */}
            <div className="rounded-xl border p-3">
              <div className="mb-2 text-sm font-semibold">Stock by location</div>
              {!selectedPartId ? (
                <div className="text-sm text-neutral-500">Select a part to view stock.</div>
              ) : selectedStocks.length === 0 ? (
                <div className="text-sm text-neutral-500">No stock entries yet (you can still use/consume).</div>
              ) : (
                <div className="grid gap-2">
                  {selectedStocks
                    .sort((a, b) => Number(b.qty_available) - Number(a.qty_available))
                    .map((s) => {
                      const l = locMap.get(s.location_id);
                      return (
                        <label key={s.location_id} className="flex items-center justify-between rounded border p-2">
                          <div className="min-w-0">
                            <div className="font-medium">{l?.code ?? "LOC"}</div>
                            <div className="text-xs text-neutral-500 truncate">
                              {l?.name ?? String(s.location_id).slice(0, 6) + "…"}
                            </div>
                          </div>
                          <div className="text-sm font-semibold tabular-nums">{Number(s.qty_available)} avail</div>
                          <input
                            type="radio"
                            name="loc"
                            className="ml-2"
                            checked={(selectedLocId ?? defaultLocId) === s.location_id}
                            onChange={() => setSelectedLocId(s.location_id)}
                          />
                        </label>
                      );
                    })}
                </div>
              )}

              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-neutral-500 mb-1">Quantity</div>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={qty}
                    onChange={(e) => setQty(Math.max(0, Number(e.target.value || 0)))}
                    className="w-full rounded border px-3 py-2"
                  />
                </div>
                <div>
                  <div className="text-xs text-neutral-500 mb-1">Location</div>
                  <select
                    value={defaultLocId ?? ""}
                    onChange={(e) => setSelectedLocId(e.target.value || null)}
                    className="w-full rounded border px-3 py-2"
                  >
                    <option value="">Auto</option>
                    {locs.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.code} — {l.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  disabled={!selectedPartId || qty <= 0}
                  onClick={() => {
                    if (!selectedPartId || qty <= 0) return;
                    const payload: PickedPart = {
                      part_id: selectedPartId,
                      location_id: selectedLocId ?? undefined,
                      qty,
                    };
                    handlePick(payload);
                    handleClose();
                  }}
                  className="rounded bg-neutral-900 px-3 py-2 text-white disabled:opacity-60"
                >
                  Use Part
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}