// features/parts/components/PartPicker.tsx (FULL FILE REPLACEMENT)
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import {
  useAiPartSuggestions,
  type AiPartSuggestion,
} from "@/features/parts/hooks/useAiPartSuggestions";

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

export type AvailabilityFlag = "in_stock" | "low_stock" | "out_of_stock" | "unknown";

export type PickedPart = {
  part_id: UUID;
  location_id?: UUID;
  qty: number;
  unit_cost: number | null;
  availability?: AvailabilityFlag | null;
};

type Props = {
  open: boolean;
  channel?: string;
  initialSearch?: string;
  workOrderId?: string;
  workOrderLineId?: string | null;
  vehicleSummary?:
    | {
        year?: number | string | null;
        make?: string | null;
        model?: string | null;
      }
    | null;
  jobDescription?: string | null;
  jobNotes?: string | null;
  onClose?: () => void;
  onPick?: (sel: PickedPart) => void;
};

function cleanNumericString(raw: string): string {
  if (raw === "") return "";
  const v = raw.replace(/[^\d.]/g, "");
  return v === "" ? "" : v.replace(/^0+(?=\d)/, "");
}

function safeQty(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return n <= 0 ? 1 : n;
}

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

  const [selectedPartId, setSelectedPartId] = useState<UUID | null>(null);
  const [selectedLocId, setSelectedLocId] = useState<UUID | null>(null);
  const [qty, setQty] = useState<number>(1);
  const [unitCostStr, setUnitCostStr] = useState<string>("");

  const {
    loading: aiLoading,
    items: aiItems,
    error: aiErr,
    suggest,
  } = useAiPartSuggestions();

  const mainLocId = useMemo(() => {
    const m = locs.find((l) => (l.code ?? "").toUpperCase() === "MAIN");
    return (m?.id as UUID | undefined) ?? null;
  }, [locs]);

  useEffect(() => {
    if (!open) return;

    (async () => {
      setErr(null);

      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) return;

      // ✅ FIX: profiles are keyed by id = auth.uid() in the rest of your app
      const { data: prof, error: pe } = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("id", userId)
        .maybeSingle();

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

      setLocs((locsData ?? []) as StockLoc[]);
    })();
  }, [open, supabase]);

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
  }, [
    open,
    workOrderId,
    workOrderLineId,
    vehicleSummary,
    jobDescription,
    jobNotes,
    suggest,
  ]);

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
          q = q.or(
            `name.ilike.%${term}%,sku.ilike.%${term}%,category.ilike.%${term}%`,
          );
        }

        const { data: rows, error } = await q;
        if (error) throw error;
        if (cancelled) return;

        const rowsSafe = (rows ?? []) as PartRow[];
        setParts(rowsSafe);

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

  useEffect(() => {
    if (!open) return;
    setSelectedPartId(null);
    setSelectedLocId(null);
    setQty(1);
    setUnitCostStr("");
    setSearch(initialSearch);
  }, [open, initialSearch]);

  const selectedStocks = selectedPartId ? stock[selectedPartId] ?? [] : [];
  const locMap = useMemo(
    () => new Map<UUID, StockLoc>(locs.map((l) => [l.id as UUID, l])),
    [locs],
  );

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

  const parsedUnitCost = useMemo(() => {
    const n = parseFloat(unitCostStr);
    return Number.isFinite(n) ? n : 0;
  }, [unitCostStr]);

  const availabilityLabel = useMemo(() => {
    if (!selectedPartId) return "—";
    if (!selectedStocks.length) return "No stock records";
    const totalAvail = selectedStocks.reduce(
      (sum, s) => sum + Number(s.qty_available || 0),
      0,
    );
    if (totalAvail <= 0) return "Out of stock";
    if (totalAvail < qty) return "Low / partial stock";
    return "In stock";
  }, [selectedPartId, selectedStocks, qty]);

  const computeAvailabilityFlag = (): AvailabilityFlag | null => {
    if (!selectedPartId || !selectedStocks.length) return "unknown";
    const totalAvail = selectedStocks.reduce(
      (sum, s) => sum + Number(s.qty_available || 0),
      0,
    );
    if (totalAvail <= 0) return "out_of_stock";
    if (totalAvail < qty) return "low_stock";
    return "in_stock";
  };

  const confirmPick = () => {
    if (!selectedPartId || qty <= 0) return;

    const payload: PickedPart = {
      part_id: selectedPartId,
      location_id: selectedLocId ?? undefined,
      qty,
      unit_cost: parsedUnitCost || null,
      availability: computeAvailabilityFlag(),
    };

    onPick?.(payload);
    emit("pick", payload);
    close();
  };

  async function resolveSuggestionToPartId(
    s: AiPartSuggestion,
  ): Promise<string | null> {
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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center"
      onClick={(e) => {
        e.stopPropagation();
      }}
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-sm"
        aria-hidden="true"
        onClick={() => close()}
      />

      {/* Panel */}
      <div
        className="relative z-[510] w-full max-w-4xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="metal-card rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 p-4 shadow-[0_22px_45px_rgba(0,0,0,0.9)] backdrop-blur-xl md:p-6">
          {/* Header */}
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-neutral-500">
                Select a part
              </div>
              <h3
                className="mt-1 text-2xl font-semibold text-white"
                style={{ fontFamily: "var(--font-blackops), system-ui" }}
              >
                Part Picker
              </h3>
            </div>

            <button
              onClick={close}
              className="rounded-full border border-neutral-700 bg-neutral-950 px-4 py-2 text-sm text-neutral-100 hover:border-orange-500 hover:bg-neutral-900"
              type="button"
            >
              Close
            </button>
          </div>

          {/* AI Suggestions */}
          <div className="mb-4 rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/60 shadow-[0_18px_40px_rgba(0,0,0,0.95)] backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-black/80 via-slate-950/80 to-black/80 px-4 py-2.5">
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-400">
                AI suggestions
              </div>
              {aiLoading ? (
                <div className="text-xs text-neutral-400">Thinking…</div>
              ) : null}
            </div>

            <div className="p-3">
              {aiErr ? (
                <div className="text-xs text-red-300">{aiErr}</div>
              ) : aiItems.length === 0 ? (
                <div className="text-xs text-neutral-500">No suggestions.</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {aiItems.map((s, i) => (
                    <button
                      key={`${s.sku ?? s.name ?? "s"}-${i}`}
                      className="rounded-full border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-3 py-1.5 text-xs text-neutral-100 shadow-[0_10px_24px_rgba(0,0,0,0.9)] hover:border-[color:var(--accent-copper,#f97316)]/70 hover:bg-[color:var(--accent-copper,#f97316)]/10"
                      title={s.rationale || ""}
                      type="button"
                      onClick={async () => {
                        const pid = await resolveSuggestionToPartId(s);
                        if (pid) {
                          setSelectedPartId(pid as UUID);
                          setQty(safeQty(Number(s.qty ?? 1)));
                        } else {
                          setSearch(s.sku || s.name || "");
                        }
                      }}
                    >
                      {(s.sku ? `${s.sku} • ` : "") + s.name}
                      {s.qty ? ` ×${s.qty}` : ""}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Search */}
          <div className="mb-4">
            <input
              className="w-full rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-3 py-2 text-sm text-neutral-100 shadow-[0_10px_24px_rgba(0,0,0,0.9)] placeholder:text-neutral-500 backdrop-blur-md"
              placeholder="Search name, SKU, category…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {err ? <div className="mb-3 text-sm text-red-300">{err}</div> : null}

          {loading ? (
            <div className="text-sm text-neutral-400">Searching…</div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {/* Results */}
              <div className="rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/60 shadow-[0_18px_40px_rgba(0,0,0,0.95)] backdrop-blur-xl">
                <div className="flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-black/80 via-slate-950/80 to-black/80 px-4 py-2.5">
                  <div className="text-xs font-medium uppercase tracking-[0.18em] text-neutral-400">
                    Results
                  </div>
                  <div className="text-[11px] text-neutral-500">{parts.length} shown</div>
                </div>

                <div className="max-h-80 overflow-auto p-2">
                  {parts.length === 0 ? (
                    <div className="p-3 text-sm text-neutral-400">No parts found.</div>
                  ) : (
                    parts.map((p) => {
                      const active = selectedPartId === (p.id as UUID);
                      return (
                        <button
                          key={p.id as UUID}
                          onClick={() => setSelectedPartId(p.id as UUID)}
                          className={[
                            "block w-full rounded-xl border px-3 py-2 text-left transition",
                            "border-[color:var(--metal-border-soft,#1f2937)] bg-black/50 hover:bg-black/70",
                            active
                              ? "ring-2 ring-[color:var(--accent-copper,#f97316)]/60"
                              : "ring-0",
                          ].join(" ")}
                          type="button"
                        >
                          <div className="truncate text-sm font-semibold text-neutral-50">
                            {p.name ?? "Unnamed part"}
                          </div>
                          <div className="truncate text-xs text-neutral-500">
                            {p.sku ?? "—"} • {p.category ?? "Uncategorized"}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Stock & Pricing */}
              <div className="rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/60 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.95)] backdrop-blur-xl">
                <div className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-neutral-400">
                  Stock & pricing
                </div>

                {!selectedPartId ? (
                  <div className="text-sm text-neutral-400">
                    Select a part to view stock.
                  </div>
                ) : selectedStocks.length === 0 ? (
                  <div className="text-sm text-neutral-400">
                    No stock entries yet (you can still use/consume).
                  </div>
                ) : (
                  <div className="grid gap-2">
                    {selectedStocks
                      .slice()
                      .sort(
                        (a, b) =>
                          Number(b.qty_available) - Number(a.qty_available),
                      )
                      .map((s) => {
                        const l = locMap.get(s.location_id as UUID);
                        const checked =
                          (selectedLocId ?? defaultLocId) === s.location_id;

                        return (
                          <label
                            key={s.location_id}
                            className={[
                              "flex items-center justify-between gap-3 rounded-xl border p-3",
                              "border-[color:var(--metal-border-soft,#1f2937)] bg-black/50",
                              checked
                                ? "ring-2 ring-[color:var(--accent-copper,#f97316)]/50"
                                : "",
                            ].join(" ")}
                          >
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-neutral-100">
                                {l?.code ?? "LOC"}
                              </div>
                              <div className="truncate text-xs text-neutral-500">
                                {l?.name ??
                                  String(s.location_id).slice(0, 6) + "…"}
                              </div>
                            </div>

                            <div className="tabular-nums text-sm font-semibold text-neutral-50">
                              {Number(s.qty_available)} avail
                            </div>

                            <input
                              type="radio"
                              name="loc"
                              className="ml-1"
                              checked={!!checked}
                              onChange={() =>
                                setSelectedLocId(s.location_id as UUID)
                              }
                            />
                          </label>
                        );
                      })}
                  </div>
                )}

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <div className="text-xs text-neutral-500">Quantity</div>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={qty}
                      onChange={(e) =>
                        setQty(Math.max(0, Number(e.target.value || 0)))
                      }
                      className="w-full rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500"
                    />
                  </div>

                  <div className="grid gap-1.5">
                    <div className="text-xs text-neutral-500">Location</div>
                    <select
                      value={defaultLocId ?? ""}
                      onChange={(e) =>
                        setSelectedLocId(
                          (e.target.value || null) as UUID | null,
                        )
                      }
                      className="w-full rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-3 py-2 text-sm text-neutral-100"
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

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <div className="text-xs text-neutral-500">Unit cost</div>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={unitCostStr}
                      onChange={(e) =>
                        setUnitCostStr(cleanNumericString(e.target.value))
                      }
                      className="w-full rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/70 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500"
                      placeholder="e.g. 45.00"
                    />
                  </div>

                  <div className="grid gap-1.5">
                    <div className="text-xs text-neutral-500">Availability</div>
                    <div className="flex items-center rounded-xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/50 px-3 py-2 text-sm text-neutral-200">
                      {availabilityLabel}
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    disabled={!selectedPartId || qty <= 0}
                    onClick={confirmPick}
                    className="inline-flex items-center justify-center rounded-full border border-[color:var(--accent-copper,#f97316)]/80 bg-gradient-to-r from-black/80 via-[color:var(--accent-copper,#f97316)]/15 to-black/80 px-5 py-2 text-sm font-semibold text-neutral-50 shadow-[0_16px_36px_rgba(0,0,0,0.95)] backdrop-blur-md transition hover:border-[color:var(--accent-copper-light,#fed7aa)] hover:bg-[color:var(--accent-copper,#f97316)]/20 disabled:cursor-not-allowed disabled:opacity-60"
                    type="button"
                  >
                    Use Part
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default PartPicker;