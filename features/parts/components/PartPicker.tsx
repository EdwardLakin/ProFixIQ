// features/parts/components/PartPicker.tsx (FULL FILE REPLACEMENT)
// Fixes:
// 1) Unit cost auto-fills from canonical inventory cost fields.
// 2) Quantity input is editable/clearable (string state), converts to number on confirm.
// 3) Keeps strict typing (no `any`).
// 4) Lint: stabilize selectedStocks via useMemo.

"use client";

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";
import {
  useAiPartSuggestions,
  type AiPartSuggestion,
} from "@/features/parts/hooks/useAiPartSuggestions";
import { toPartDisplaySummary } from "@/features/parts/lib/part-display";

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

export type AvailabilityFlag =
  | "in_stock"
  | "low_stock"
  | "out_of_stock"
  | "unknown";

export type PickedPart = {
  part_id: UUID;
  location_id?: UUID;
  qty: number;
  unit_cost: number | null;
  availability?: AvailabilityFlag | null;
  idempotency_key: string;
};

type Props = {
  open: boolean;
  channel?: string;
  initialSearch?: string;
  workOrderId?: string;
  workOrderLineId?: string | null;
  vehicleSummary?: {
    year?: number | string | null;
    make?: string | null;
    model?: string | null;
  } | null;
  jobDescription?: string | null;
  jobNotes?: string | null;
  onClose?: () => void;
  onPick?: (sel: PickedPart) => void | Promise<void>;
  onSubmittingChange?: (submitting: boolean) => void;
  requireLocation?: boolean;
  variant?: "modal" | "inline";
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

function parseQty(raw: string): number {
  if (raw.trim() === "") return 0;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : 0;
}

function getPartDefaultUnitCost(p: PartRow | null): number | null {
  if (!p) return null;

  const defaultCost = p.default_cost;
  if (typeof defaultCost === "number" && Number.isFinite(defaultCost)) {
    return defaultCost;
  }

  const cost = p.cost;
  if (typeof cost === "number" && Number.isFinite(cost)) return cost;

  return null;
}

function actionErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return "Failed to use part.";
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
  onSubmittingChange,
  requireLocation = false,
  variant = "modal",
}: Props) {
  const supabase = useMemo(() => createBrowserSupabase(), []);

  const [shopId, setShopId] = useState<UUID>("");
  const [search, setSearch] = useState(initialSearch);

  const [parts, setParts] = useState<PartRow[]>([]);
  const [stock, setStock] = useState<Record<UUID, VStock[]>>({});
  const [locs, setLocs] = useState<StockLoc[]>([]);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const operationRef = useRef<{
    fingerprint: string;
    idempotencyKey: string;
  } | null>(null);

  const [selectedPartId, setSelectedPartId] = useState<UUID | null>(null);
  const [selectedLocId, setSelectedLocId] = useState<UUID | null>(null);

  // ✅ allow clearing/editing freely
  const [qtyStr, setQtyStr] = useState<string>("1");
  const qtyNum = useMemo(() => parseQty(qtyStr), [qtyStr]);

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

  const selectPart = (partId: UUID, part?: PartRow) => {
    if (selectedPartId === partId) return;

    const selected =
      part ?? parts.find((candidate) => candidate.id === partId) ?? null;
    const defaultCost = getPartDefaultUnitCost(selected);

    setSelectedPartId(partId);
    setSelectedLocId(null);
    setUnitCostStr(
      typeof defaultCost === "number" ? defaultCost.toFixed(2) : "",
    );
    setErr(null);
    operationRef.current = null;
  };

  useEffect(() => {
    if (!open) return;

    (async () => {
      setErr(null);

      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) return;

      // profiles keyed by id = auth.uid()
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
            `name.ilike.%${term}%,sku.ilike.%${term}%,part_number.ilike.%${term}%,category.ilike.%${term}%`,
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
            .select(
              "part_id, location_id, qty_available, qty_on_hand, qty_reserved",
            )
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
        if (!cancelled)
          setErr(e instanceof Error ? e.message : "Search failed");
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
    setQtyStr("1");
    setUnitCostStr("");
    setSearch(initialSearch);
    setSubmitting(false);
    submittingRef.current = false;
    operationRef.current = null;
  }, [open, initialSearch]);

  // ✅ LINT FIX: stabilize selectedStocks
  const selectedStocks = useMemo(() => {
    return selectedPartId ? (stock[selectedPartId] ?? []) : [];
  }, [selectedPartId, stock]);

  const locMap = useMemo(
    () => new Map<UUID, StockLoc>(locs.map((l) => [l.id as UUID, l])),
    [locs],
  );

  const bestAvailableLocId = useMemo(() => {
    const best = selectedStocks
      .slice()
      .sort((a, b) => Number(b.qty_available) - Number(a.qty_available))[0];
    return best?.location_id ?? null;
  }, [selectedStocks]);

  const defaultLocId: UUID | null =
    selectedLocId ?? bestAvailableLocId ?? mainLocId;
  const selectedLocationStock = useMemo(
    () =>
      defaultLocId
        ? (selectedStocks.find(
            (entry) => entry.location_id === defaultLocId,
          ) ?? null)
        : null,
    [defaultLocId, selectedStocks],
  );
  const selectedLocationAvailable = selectedLocationStock
    ? Number(selectedLocationStock.qty_available || 0)
    : null;

  const emit = (name: "close" | "pick", detail?: unknown) => {
    const ev = new CustomEvent(`${channel}:${name}`, { detail });
    window.dispatchEvent(ev);
  };

  const close = () => {
    if (submittingRef.current) return;
    onClose?.();
    emit("close");
  };

  const parsedUnitCost = useMemo(() => {
    const n = Number.parseFloat(unitCostStr);
    return Number.isFinite(n) ? n : null;
  }, [unitCostStr]);

  const availabilityLabel = useMemo(() => {
    if (!selectedPartId) return "—";
    if (!defaultLocId) return "No location selected";
    if (selectedLocationAvailable == null) {
      return "No stock at selected location";
    }
    if (selectedLocationAvailable <= 0) return "Out of stock";
    if (selectedLocationAvailable < qtyNum) return "Low / partial stock";
    return "In stock";
  }, [defaultLocId, qtyNum, selectedLocationAvailable, selectedPartId]);

  const computeAvailabilityFlag = (): AvailabilityFlag | null => {
    if (!selectedPartId || selectedLocationAvailable == null) return "unknown";
    if (selectedLocationAvailable <= 0) return "out_of_stock";
    if (selectedLocationAvailable < qtyNum) return "low_stock";
    return "in_stock";
  };

  const hasPartsWithoutStockRecords = useMemo(() => {
    if (parts.length === 0) return false;
    return Object.keys(stock).length === 0;
  }, [parts, stock]);

  const confirmPick = async () => {
    if (submittingRef.current || !selectedPartId) return;

    const qty = qtyNum;
    if (qty <= 0) return;
    if (requireLocation && !defaultLocId) {
      setErr("Pick an inventory location first.");
      return;
    }

    const unitCost = parsedUnitCost;
    const fingerprint = JSON.stringify([
      selectedPartId,
      defaultLocId,
      qty,
      unitCost,
    ]);
    if (operationRef.current?.fingerprint !== fingerprint) {
      operationRef.current = {
        fingerprint,
        idempotencyKey: crypto.randomUUID(),
      };
    }

    const payload: PickedPart = {
      part_id: selectedPartId,
      location_id: defaultLocId ?? undefined,
      qty,
      unit_cost: unitCost,
      availability: computeAvailabilityFlag(),
      idempotency_key: operationRef.current.idempotencyKey,
    };

    submittingRef.current = true;
    setSubmitting(true);
    setErr(null);
    onSubmittingChange?.(true);

    try {
      await onPick?.(payload);
      emit("pick", payload);
      operationRef.current = null;
      submittingRef.current = false;
      setSubmitting(false);
      onSubmittingChange?.(false);
      close();
    } catch (error: unknown) {
      setErr(actionErrorMessage(error));
      submittingRef.current = false;
      setSubmitting(false);
      onSubmittingChange?.(false);
    }
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

    if (s.title) {
      const { data } = await supabase
        .from("parts")
        .select("id")
        .eq("shop_id", shopId)
        .ilike("name", s.title)
        .maybeSingle();
      if (data?.id) return data.id as string;
    }

    return null;
  }

  if (!open) return null;

  const panel = (
    <div
      aria-busy={submitting}
      className="metal-card rounded-2xl border border-[color:var(--metal-border-soft,var(--theme-border-soft))] bg-[color:var(--theme-surface-overlay)] p-4 shadow-[var(--theme-shadow-medium)] backdrop-blur-xl md:p-6"
    >
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--theme-text-muted)]">
            Select a part
          </div>
          <h3
            className="mt-1 text-2xl font-semibold text-[color:var(--theme-text-primary)]"
            style={{ fontFamily: "var(--font-blackops), system-ui" }}
          >
            Part Picker
          </h3>
        </div>

        <button
          onClick={close}
          disabled={submitting}
          className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-4 py-2 text-sm text-[color:var(--theme-text-primary)] hover:border-orange-500 hover:bg-[color:var(--theme-surface-panel)]"
          type="button"
        >
          Close
        </button>
      </div>

      {/* AI Suggestions */}
      <div className="mb-4 rounded-2xl border border-[color:var(--metal-border-soft,var(--theme-border-soft))] bg-[color:var(--theme-surface-overlay)] shadow-[var(--theme-shadow-medium)] backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-[color:var(--theme-border-soft)] bg-gradient-to-r from-[color:var(--theme-surface-page)] via-[color:var(--theme-surface-panel)] to-[color:var(--theme-surface-page)] px-4 py-2.5">
          <div className="text-xs font-medium uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
            AI suggestions
          </div>
          {aiLoading ? (
            <div className="text-xs text-[color:var(--theme-text-secondary)]">
              Thinking…
            </div>
          ) : null}
        </div>

        <div className="p-3">
          {aiErr ? (
            <div className="text-xs text-red-300">{aiErr}</div>
          ) : aiItems.length === 0 ? (
            <div className="text-xs text-[color:var(--theme-text-muted)]">
              No suggestions.
            </div>
          ) : (
            <div className="grid gap-2">
              {aiItems.map((s, i) => (
                <div
                  key={`${s.sku ?? s.title ?? "s"}-${i}`}
                  className="rounded-xl border border-[color:var(--metal-border-soft,var(--theme-border-soft))] bg-[color:var(--theme-surface-overlay)] p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
                        {s.title}
                      </div>
                      <div className="text-[11px] text-[color:var(--theme-text-secondary)]">
                        {s.sku ? `${s.sku} • ` : ""}
                        Qty {s.quantitySuggestion} •{" "}
                        {s.fitmentConfidence.replaceAll("_", " ")}
                      </div>
                    </div>
                    <button
                      className="rounded-full border border-[color:var(--accent-copper,#f97316)]/60 px-3 py-1 text-[11px] text-orange-200 disabled:opacity-50"
                      type="button"
                      disabled={!s.addable || submitting}
                      onClick={async () => {
                        const pid = await resolveSuggestionToPartId(s);
                        if (pid) {
                          selectPart(pid as UUID);
                          setQtyStr(
                            String(safeQty(Number(s.quantitySuggestion ?? 1))),
                          );
                        } else {
                          setSearch(s.sku || s.title || "");
                        }
                      }}
                    >
                      Review for add
                    </button>
                  </div>
                  <div className="mt-2 text-[11px] text-[color:var(--theme-text-secondary)]">
                    {s.reviewRecommendation}
                  </div>
                  {s.warnings.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-[11px] text-amber-300">
                      {s.warnings.slice(0, 2).map((warning) => (
                        <li key={warning.type}>• {warning.message}</li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-1">
                    {s.linkedEvidence.slice(0, 3).map((e) => (
                      <span
                        key={e.id}
                        className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-0.5 text-[10px] text-[color:var(--theme-text-secondary)]"
                      >
                        {e.label}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          className="w-full rounded-xl border border-[color:var(--metal-border-soft,var(--theme-border-soft))] bg-[color:var(--theme-surface-overlay)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] shadow-[var(--theme-shadow-medium)] placeholder:text-[color:var(--theme-text-muted)] backdrop-blur-md"
          placeholder="Search name, SKU, category…"
          value={search}
          disabled={submitting}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {err ? (
        <div className="mb-3 text-sm text-red-300" role="alert">
          {err}
        </div>
      ) : null}

      {loading ? (
        <div className="text-sm text-[color:var(--theme-text-secondary)]">
          Searching…
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Results */}
          <div className="rounded-2xl border border-[color:var(--metal-border-soft,var(--theme-border-soft))] bg-[color:var(--theme-surface-overlay)] shadow-[var(--theme-shadow-medium)] backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-[color:var(--theme-border-soft)] bg-gradient-to-r from-[color:var(--theme-surface-page)] via-[color:var(--theme-surface-panel)] to-[color:var(--theme-surface-page)] px-4 py-2.5">
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
                Results
              </div>
              <div className="text-[11px] text-[color:var(--theme-text-muted)]">
                {parts.length} shown
              </div>
            </div>

            <div className="max-h-80 overflow-auto p-2">
              {parts.length === 0 ? (
                <div className="p-3 text-sm text-[color:var(--theme-text-secondary)]">
                  No parts found.
                </div>
              ) : (
                parts.map((p) => {
                  const pid = p.id as UUID;
                  const summary = toPartDisplaySummary(p);
                  const active = selectedPartId === pid;
                  return (
                    <button
                      key={pid}
                      onClick={() => {
                        selectPart(pid, p);
                      }}
                      disabled={submitting}
                      className={[
                        "block w-full rounded-xl border px-3 py-2 text-left transition",
                        "border-[color:var(--metal-border-soft,var(--theme-border-soft))] bg-[color:var(--theme-surface-inset)] hover:bg-[color:var(--theme-surface-overlay)]",
                        active
                          ? "ring-2 ring-[color:var(--accent-copper,#f97316)]/60"
                          : "ring-0",
                      ].join(" ")}
                      type="button"
                    >
                      <div className="truncate text-sm font-semibold text-[color:var(--theme-text-primary)]">
                        {summary.name}
                      </div>
                      <div className="truncate text-xs text-[color:var(--theme-text-muted)]">
                        {summary.sku ?? "No SKU"} •{" "}
                        {summary.partNumber
                          ? `Part # ${summary.partNumber}`
                          : "No part #"}{" "}
                        • {summary.category ?? "Uncategorized"}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Stock & Pricing */}
          <div className="rounded-2xl border border-[color:var(--metal-border-soft,var(--theme-border-soft))] bg-[color:var(--theme-surface-overlay)] p-4 shadow-[var(--theme-shadow-medium)] backdrop-blur-xl">
            <div className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-[color:var(--theme-text-secondary)]">
              Stock & pricing
            </div>

            {hasPartsWithoutStockRecords ? (
              <div className="mb-2 rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-xs text-[color:var(--theme-text-secondary)]">
                Parts imported. Stock records not initialized yet.
              </div>
            ) : null}

            {!selectedPartId ? (
              <div className="text-sm text-[color:var(--theme-text-secondary)]">
                Select a part to view stock.
              </div>
            ) : selectedStocks.length === 0 ? (
              <div className="text-sm text-[color:var(--theme-text-secondary)]">
                No available stock entries. Receive stock before using this part.
              </div>
            ) : (
              <div className="grid gap-2">
                {selectedStocks
                  .slice()
                  .sort(
                    (a, b) => Number(b.qty_available) - Number(a.qty_available),
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
                          "border-[color:var(--metal-border-soft,var(--theme-border-soft))] bg-[color:var(--theme-surface-inset)]",
                          checked
                            ? "ring-2 ring-[color:var(--accent-copper,#f97316)]/50"
                            : "",
                        ].join(" ")}
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
                            {l?.code ?? "LOC"}
                          </div>
                          <div className="truncate text-xs text-[color:var(--theme-text-muted)]">
                            {l?.name ?? String(s.location_id).slice(0, 6) + "…"}
                          </div>
                        </div>

                        <div className="tabular-nums text-sm font-semibold text-[color:var(--theme-text-primary)]">
                          {Number(s.qty_available)} avail
                        </div>

                        <input
                          type="radio"
                          name="loc"
                          className="ml-1"
                          checked={!!checked}
                          disabled={submitting}
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
                <div className="text-xs text-[color:var(--theme-text-muted)]">
                  Quantity
                </div>
                <input
                  type="text"
                  inputMode="decimal"
                  value={qtyStr}
                  disabled={submitting}
                  onChange={(e) =>
                    setQtyStr(cleanNumericString(e.target.value))
                  }
                  className="w-full rounded-xl border border-[color:var(--metal-border-soft,var(--theme-border-soft))] bg-[color:var(--theme-surface-overlay)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)]"
                  placeholder="e.g. 1"
                />
              </div>

              <div className="grid gap-1.5">
                <div className="text-xs text-[color:var(--theme-text-muted)]">
                  Location
                </div>
                <select
                  value={defaultLocId ?? ""}
                  disabled={submitting}
                  onChange={(e) =>
                    setSelectedLocId((e.target.value || null) as UUID | null)
                  }
                  className="w-full rounded-xl border border-[color:var(--metal-border-soft,var(--theme-border-soft))] bg-[color:var(--theme-surface-overlay)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)]"
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
                <div className="text-xs text-[color:var(--theme-text-muted)]">
                  Unit cost
                </div>
                <input
                  type="text"
                  inputMode="decimal"
                  value={unitCostStr}
                  disabled={submitting}
                  onChange={(e) =>
                    setUnitCostStr(cleanNumericString(e.target.value))
                  }
                  className="w-full rounded-xl border border-[color:var(--metal-border-soft,var(--theme-border-soft))] bg-[color:var(--theme-surface-overlay)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] placeholder:text-[color:var(--theme-text-muted)]"
                  placeholder="e.g. 45.00"
                />
              </div>

              <div className="grid gap-1.5">
                <div className="text-xs text-[color:var(--theme-text-muted)]">
                  Availability
                </div>
                <div className="flex items-center rounded-xl border border-[color:var(--metal-border-soft,var(--theme-border-soft))] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)]">
                  {availabilityLabel}
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                disabled={
                  submitting ||
                  !selectedPartId ||
                  qtyNum <= 0 ||
                  (requireLocation &&
                    (!defaultLocId ||
                      selectedLocationAvailable == null ||
                      selectedLocationAvailable < qtyNum))
                }
                onClick={() => void confirmPick()}
                className="inline-flex items-center justify-center rounded-full border border-[color:var(--accent-copper,#f97316)]/80 bg-gradient-to-r from-[color:var(--theme-surface-page)] via-[color:var(--accent-copper,#f97316)]/15 to-[color:var(--theme-surface-page)] px-5 py-2 text-sm font-semibold text-[color:var(--theme-text-primary)] shadow-[var(--theme-shadow-medium)] backdrop-blur-md transition hover:border-[color:var(--accent-copper-light,#fed7aa)] hover:bg-[color:var(--accent-copper,#f97316)]/20 disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
              >
                {submitting ? "Using…" : "Use Part"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (variant === "inline") return panel;

  return (
    <div
      className="fixed inset-0 z-[500] flex items-center justify-center"
      onClick={(e) => {
        e.stopPropagation();
      }}
    >
      <div
        className="fixed inset-0 bg-[color:var(--theme-surface-overlay)] backdrop-blur-sm"
        aria-hidden="true"
        onClick={() => {
          if (!submittingRef.current) close();
        }}
      />
      <div
        className="relative z-[510] w-full max-w-4xl"
        onClick={(e) => e.stopPropagation()}
      >
        {panel}
      </div>
    </div>
  );
}

export default PartPicker;
