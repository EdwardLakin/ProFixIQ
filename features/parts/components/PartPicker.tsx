"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { useAiPartSuggestions, AiPartSuggestion } from "@/features/parts/hooks/useAiPartSuggestions";

type DB = Database;
type UUID = string;

type PartRow = DB["public"]["Tables"]["parts"]["Row"];
type StockLoc = DB["public"]["Tables"]["stock_locations"]["Row"];

type VStock = {
  part_id: UUID;
  location_id: UUID;
  qty_available: number;
  qty_on_hand: number;
  qty_reserved: number;
};

export type PickedPart = { part_id: UUID; location_id?: UUID; qty: number };

type Props = {
  open: boolean;
  /** Optional window event channel (legacy nicety) */
  channel?: string;
  /** Prefill search text */
  initialSearch?: string;
  /** Work-order context (for AI + RLS) */
  workOrderId?: string;
  workOrderLineId?: string | null;
  vehicleSummary?: { year?: number | string | null; make?: string | null; model?: string | null } | null;
  jobDescription?: string | null;
  jobNotes?: string | null;
  /** Callbacks */
  onClose?: () => void;
  onPick?: (sel: PickedPart) => void;
};

export function PartPicker({
  open,
  channel = "partpicker",
  initialSearch = "",
  workOrderId,
  workOrderLineId,
  vehicleSummary,
  jobDescription,
  jobNotes,
  onClose,
  onPick,
}: Props) {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);
  const [shopId, setShopId] = useState<UUID>("");
  const [search, setSearch] = useState(initialSearch);
  const [parts, setParts] = useState<PartRow[]>([]);
  const [stock, setStock] = useState<Record<UUID, VStock[]>>({});
  const [locs, setLocs] = useState<StockLoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // selection state
  const [selectedPartId, setSelectedPartId] = useState<UUID | null>(null);
  const [selectedLocId, setSelectedLocId] = useState<UUID | null>(null);
  const [qty, setQty] = useState<number>(1);

  // AI suggestions
  const { loading: aiLoading, items: aiItems, error: aiErr, suggest } = useAiPartSuggestions();

  // MAIN location if present
  const mainLocId = useMemo(() => {
    const m = locs.find((l) => (l.code ?? "").toUpperCase() === "MAIN");
    return (m?.id as UUID | undefined) ?? null;
  }, [locs]);

  // fetch shop + locations
  useEffect(() => {
    if (!open) return;
    (async () => {
      setErr(null);
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) return;

      const { data: prof, error: pe } = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("user_id", userId)
        .single();
      if (pe) {
        setErr(pe.message);
        return;
      }
      const sid = (prof?.shop_id as UUID | null) ?? "";
      setShopId(sid);
      if (!sid) return;

      const { data: locsData, error: le } = await supabase
        .from("stock_locations")
        .select("id, code, name, shop_id")
        .eq("shop_id", sid)
        .order("code");
      if (le) {
        setErr(le.message);
        return;
      }
      setLocs(locsData ?? []);
    })();
  }, [open, supabase]);

  // AI: fetch suggestions on first open (if context provided)
  useEffect(() => {
    if (!open || !workOrderId) return;
    void suggest({
      workOrderId,
      workOrderLineId: workOrderLineId ?? null,
      vehicle: vehicleSummary ?? null,
      description: jobDescription ?? null,
      notes: jobNotes ?? null,
      topK: 5,
    });
  }, [open, workOrderId, workOrderLineId, vehicleSummary, jobDescription, jobNotes, suggest]);

  // search parts + fetch stock for visible parts
  useEffect(() => {
    if (!open || !shopId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        let q = supabase
          .from("parts")
          .select("*")
          .eq("shop_id", shopId)
          .order("name")
          .limit(50);

        const term = search.trim();
        if (term) {
          q = q.or(`name.ilike.%${term}%,sku.ilike.%${term}%,category.ilike.%${term}%`);
        }

        const { data: rows, error } = await q;
        if (error) throw error;
        if (cancelled) return;

        const rowsSafe = (rows ?? []) as PartRow[];
        setParts(rowsSafe);

        // fetch v_part_stock for these parts
        const ids = rowsSafe.map((r) => r.id as UUID);
        if (ids.length) {
          const { data: vs, error: ve } = await supabase
            .from("v_part_stock")
            .select("part_id, location_id, qty_available, qty_on_hand, qty_reserved")
            .in("part_id", ids);
          if (ve) throw ve;

          const grouped: Record<UUID, VStock[]> = {};
          (vs ?? []).forEach((s) => {
            const key = s.part_id as UUID;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push({
              part_id: s.part_id as UUID,
              location_id: s.location_id as UUID,
              qty_available: Number(s.qty_available),
              qty_on_hand: Number(s.qty_on_hand),
              qty_reserved: Number(s.qty_reserved),
            });
          });
          if (!cancelled) setStock(grouped);
        } else {
          setStock({});
        }
      } catch (e: unknown) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Search failed");
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

  const selectedStocks = selectedPartId ? stock[selectedPartId] ?? [] : [];
  const locMap = new Map<UUID, StockLoc>(locs.map((l) => [l.id as UUID, l]));
  const defaultLocId: UUID | null =
    selectedLocId ?? mainLocId ?? (selectedStocks[0]?.location_id ?? null);

  const emit = (name: "close" | "pick", detail?: unknown) => {
    const ev = new CustomEvent(`${channel}:${name}`, { detail });
    window.dispatchEvent(ev);
  };

  const close = () => {
    onClose?.();
    emit("close");
  };

  const confirmPick = () => {
    if (!selectedPartId || qty <= 0) return;
    const payload: PickedPart = {
      part_id: selectedPartId,
      location_id: selectedLocId ?? undefined,
      qty,
    };
    onPick?.(payload);
    emit("pick", payload);
    close();
  };

  // Try to resolve an AI suggestion to a concrete part (SKU first, then name)
  async function resolveSuggestionToPartId(s: AiPartSuggestion): Promise<string | null> {
    if (!shopId) return null;
    if (s.sku) {
      const { data } = await supabase
        .from("parts")
        .select("id")
        .eq("shop_id", shopId)
        .eq("sku", s.sku)
        .maybeSingle();
      if (data?.id) return data.id as string;
    }
    if (s.name) {
      const { data } = await supabase
        .from("parts")
        .select("id")
        .eq("shop_id", shopId)
        .ilike("name", s.name)
        .maybeSingle();
      if (data?.id) return data.id as string;
    }
    return null;
  }

  return !open ? null : (
    <div className="fixed inset-0 z-[500] flex items-center justify-center">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" aria-hidden="true" onClick={close} />

      {/* Panel */}
      <div className="relative z-[510] w-full max-w-3xl rounded-lg border border-orange-400 bg-neutral-950 p-4 text-white shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-xs text-neutral-400">Select a part</div>
            <h3 className="text-lg font-semibold font-header">Part Picker</h3>
          </div>
          <button
            onClick={close}
            className="rounded border border-neutral-700 px-2 py-1 text-sm text-neutral-200 hover:bg-neutral-800"
          >
            Close
          </button>
        </div>

        {/* AI suggestions */}
        <div className="mb-3 rounded border border-neutral-800">
          <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
            <div className="text-sm font-semibold">AI suggestions</div>
            {aiLoading && <div className="text-xs text-neutral-400">Thinking…</div>}
          </div>
          <div className="p-2">
            {aiErr ? (
              <div className="text-xs text-red-400">{aiErr}</div>
            ) : aiItems.length === 0 ? (
              <div className="text-xs text-neutral-500">No suggestions.</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {aiItems.map((s, i) => (
                  <button
                    key={i}
                    className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-900"
                    title={s.rationale || ""}
                    onClick={async () => {
                      const pid = await resolveSuggestionToPartId(s);
                      if (pid) {
                        setSelectedPartId(pid as UUID);
                        setQty(Math.max(1, Number(s.qty ?? 1)));
                      } else {
                        // fallback: prime the search so the tech can pick manually
                        setSearch(s.sku || s.name || "");
                      }
                    }}
                  >
                    {(s.sku ? `${s.sku} • ` : "") + s.name} {s.qty ? `×${s.qty}` : ""}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="mb-3">
          <input
            className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-white placeholder:text-neutral-400"
            placeholder="Search name, SKU, category…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {err && <div className="mb-2 text-sm text-red-400">{err}</div>}

        {loading ? (
          <div className="text-sm text-neutral-400">Searching…</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {/* Left: results */}
            <div className="rounded-xl border border-neutral-800">
              <div className="border-b border-neutral-800 p-2 text-sm font-semibold">Results</div>
              <div className="max-h-72 overflow-auto">
                {parts.length === 0 ? (
                  <div className="p-3 text-sm text-neutral-400">No parts found.</div>
                ) : (
                  parts.map((p) => (
                    <button
                      key={p.id as UUID}
                      onClick={() => setSelectedPartId(p.id as UUID)}
                      className={`block w-full border-b border-neutral-800 px-3 py-2 text-left hover:bg-neutral-900 ${
                        selectedPartId === (p.id as UUID) ? "bg-neutral-900" : ""
                      }`}
                    >
                      <div className="truncate font-medium">{p.name}</div>
                      <div className="truncate text-xs text-neutral-500">
                        {p.sku ?? "—"} • {p.category ?? "Uncategorized"}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Right: stock + confirm */}
            <div className="rounded-xl border border-neutral-800 p-3">
              <div className="mb-2 text-sm font-semibold">Stock by location</div>
              {!selectedPartId ? (
                <div className="text-sm text-neutral-400">Select a part to view stock.</div>
              ) : selectedStocks.length === 0 ? (
                <div className="text-sm text-neutral-400">No stock entries yet (you can still use/consume).</div>
              ) : (
                <div className="grid gap-2">
                  {selectedStocks
                    .slice()
                    .sort((a, b) => Number(b.qty_available) - Number(a.qty_available))
                    .map((s) => {
                      const l = locMap.get(s.location_id as UUID);
                      const checked = (selectedLocId ?? defaultLocId) === s.location_id;
                      return (
                        <label key={s.location_id} className="flex items-center justify-between rounded border border-neutral-800 p-2">
                          <div className="min-w-0">
                            <div className="font-medium">{l?.code ?? "LOC"}</div>
                            <div className="truncate text-xs text-neutral-500">
                              {l?.name ?? String(s.location_id).slice(0, 6) + "…"}
                            </div>
                          </div>
                          <div className="tabular-nums text-sm font-semibold">{Number(s.qty_available)} avail</div>
                          <input
                            type="radio"
                            name="loc"
                            className="ml-2"
                            checked={!!checked}
                            onChange={() => setSelectedLocId(s.location_id as UUID)}
                          />
                        </label>
                      );
                    })}
                </div>
              )}

              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <div className="mb-1 text-xs text-neutral-500">Quantity</div>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={qty}
                    onChange={(e) => setQty(Math.max(0, Number(e.target.value || 0)))}
                    className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2"
                  />
                </div>
                <div>
                  <div className="mb-1 text-xs text-neutral-500">Location</div>
                  <select
                    value={defaultLocId ?? ""}
                    onChange={(e) => setSelectedLocId((e.target.value || null) as UUID | null)}
                    className="w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2"
                  >
                    <option value="">Auto</option>
                    {locs.map((l) => (
                      <option key={l.id as UUID} value={l.id as UUID}>
                        {l.code} — {l.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-4 flex justify-end">
                <button
                  disabled={!selectedPartId || qty <= 0}
                  onClick={confirmPick}
                  className="rounded border border-orange-500 px-3 py-2 font-header text-sm text-white hover:bg-orange-500/10 disabled:opacity-60"
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

export default PartPicker;