"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";

type BatchRow = {
  id: string;
  raw_part_number: string | null;
  raw_description: string | null;
  raw_qty: number | null;
  raw_unit_cost: number | null;
  raw_sell: number | null;
  raw_notes: string | null;
  mapped_menu_repair_item_id: string | null;
  mapped_menu_repair_item_part_id: string | null;
  mapped_confidence: number | null;
  review_status: "matched" | "needs_review" | "unmatched";
};

type RepairItem = {
  id: string;
  name: string | null;
  complaint: string | null;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
};

type RepairPart = {
  id: string;
  menu_repair_item_id: string;
  part_name: string;
  part_number: string | null;
  supplier_part_number: string | null;
};

export default function PricingBatchReviewPage(): JSX.Element {
  const params = useParams<{ batchId: string }>();
  const router = useRouter();
  const batchId = params.batchId;

  const [rows, setRows] = useState<BatchRow[]>([]);
  const [repairItems, setRepairItems] = useState<RepairItem[]>([]);
  const [repairParts, setRepairParts] = useState<RepairPart[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const partOptionsByRepairId = useMemo(() => {
    const map = new Map<string, RepairPart[]>();
    for (const part of repairParts) {
      const arr = map.get(part.menu_repair_item_id) ?? [];
      arr.push(part);
      map.set(part.menu_repair_item_id, arr);
    }
    return map;
  }, [repairParts]);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/menu-repair-items/pricing/review-batch?batchId=${encodeURIComponent(batchId)}`,
        { cache: "no-store" },
      );
      const json = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            rows?: BatchRow[];
            repairItems?: RepairItem[];
            repairParts?: RepairPart[];
            error?: string;
          }
        | null;

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? "Failed to load review batch");
      }

      setRows(json.rows ?? []);
      setRepairItems(json.repairItems ?? []);
      setRepairParts(json.repairParts ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load review batch");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [batchId]);

  async function saveRow(next: {
    rowId: string;
    mappedMenuRepairItemId: string | null;
    mappedMenuRepairItemPartId: string | null;
    reviewStatus: "matched" | "needs_review" | "unmatched";
  }) {
    setSavingRowId(next.rowId);
    try {
      const res = await fetch("/api/menu-repair-items/pricing/remap-batch-row", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });

      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? "Failed to save row");
      }

      setRows((prev) =>
        prev.map((row) =>
          row.id === next.rowId
            ? {
                ...row,
                mapped_menu_repair_item_id: next.mappedMenuRepairItemId,
                mapped_menu_repair_item_part_id: next.mappedMenuRepairItemPartId,
                review_status: next.reviewStatus,
                mapped_confidence: next.reviewStatus === "matched" ? 1 : row.mapped_confidence,
              }
            : row,
        ),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save row");
    } finally {
      setSavingRowId(null);
    }
  }

  async function applyBatch() {
    setApplying(true);
    try {
      const res = await fetch("/api/menu-repair-items/pricing/apply-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId }),
      });

      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; appliedCount?: number; error?: string }
        | null;

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? "Failed to apply batch");
      }

      toast.success(`Applied ${json.appliedCount ?? 0} pricing snapshot(s).`);
      router.push("/parts/pricing-refresh");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to apply batch");
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="space-y-4 p-4 text-[color:var(--theme-text-primary)]">
      <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">Review Supplier Batch</h1>
            <p className="text-sm text-[color:var(--theme-text-secondary)]">
              Confirm mappings before creating fresh pricing snapshots.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void applyBatch()}
            disabled={applying || loading}
            className="rounded-lg border border-[#8b5a2b]/60 bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm font-semibold text-[#c88a4d] disabled:opacity-60"
          >
            {applying ? "Applying…" : "Apply Batch"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-4">
        {loading ? (
          <div className="text-sm text-[color:var(--theme-text-secondary)]">Loading batch…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-[color:var(--theme-text-secondary)]">No rows found.</div>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => {
              const partsForRepair = row.mapped_menu_repair_item_id
                ? partOptionsByRepairId.get(row.mapped_menu_repair_item_id) ?? []
                : [];

              return (
                <div
                  key={row.id}
                  className="space-y-3 rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3"
                >
                  <div>
                    <div className="font-medium text-[color:var(--theme-text-primary)]">
                      {row.raw_description ?? row.raw_part_number ?? "Imported row"}
                    </div>
                    <div className="mt-1 text-xs text-[color:var(--theme-text-muted)]">
                      Part #: {row.raw_part_number ?? "—"} • Qty: {row.raw_qty ?? "—"} •
                      Cost: {row.raw_unit_cost ?? "—"} • Status: {row.review_status}
                    </div>
                  </div>

                  <div className="grid gap-2 md:grid-cols-3">
                    <select
                      value={row.mapped_menu_repair_item_id ?? ""}
                      onChange={(e) => {
                        const repairId = e.target.value || null;
                        void saveRow({
                          rowId: row.id,
                          mappedMenuRepairItemId: repairId,
                          mappedMenuRepairItemPartId: null,
                          reviewStatus: repairId ? "needs_review" : "unmatched",
                        });
                      }}
                      disabled={savingRowId === row.id}
                      className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)]"
                    >
                      <option value="">Select repair item</option>
                      {repairItems.map((repair) => {
                        const label = [
                          repair.name ?? repair.complaint ?? "Repair item",
                          [repair.vehicle_year, repair.vehicle_make, repair.vehicle_model]
                            .filter(Boolean)
                            .join(" "),
                        ]
                          .filter(Boolean)
                          .join(" • ");

                        return (
                          <option key={repair.id} value={repair.id}>
                            {label}
                          </option>
                        );
                      })}
                    </select>

                    <select
                      value={row.mapped_menu_repair_item_part_id ?? ""}
                      onChange={(e) => {
                        const partId = e.target.value || null;
                        void saveRow({
                          rowId: row.id,
                          mappedMenuRepairItemId: row.mapped_menu_repair_item_id,
                          mappedMenuRepairItemPartId: partId,
                          reviewStatus:
                            row.mapped_menu_repair_item_id && partId ? "matched" : "needs_review",
                        });
                      }}
                      disabled={!row.mapped_menu_repair_item_id || savingRowId === row.id}
                      className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)]"
                    >
                      <option value="">Select repair part</option>
                      {partsForRepair.map((part) => (
                        <option key={part.id} value={part.id}>
                          {part.part_name}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={() =>
                        void saveRow({
                          rowId: row.id,
                          mappedMenuRepairItemId: row.mapped_menu_repair_item_id,
                          mappedMenuRepairItemPartId: row.mapped_menu_repair_item_part_id,
                          reviewStatus:
                            row.mapped_menu_repair_item_id ? "matched" : "unmatched",
                        })
                      }
                      disabled={savingRowId === row.id}
                      className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] disabled:opacity-60"
                    >
                      {savingRowId === row.id ? "Saving…" : "Confirm Row"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
