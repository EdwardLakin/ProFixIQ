"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type QueueRow = {
  menuRepairItemId: string;
  name: string;
  complaint: string | null;
  vehicleYear: number | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  engine: string | null;
  drivetrain: string | null;
  transmission: string | null;
  activePricingSnapshotId: string | null;
  pricingStatus: "fresh" | "stale" | "expired";
  daysUntilExpiry: number | null;
  supplierName: string | null;
  quotedAt: string | null;
  validUntil: string | null;
  pricingValidDays: number;
  totalCost: number | null;
  totalSell: number | null;
  currency: string;
};

export default function PricingRefreshPage(): JSX.Element {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [supplierName, setSupplierName] = useState("");

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([k]) => k),
    [selected],
  );

  async function loadQueue() {
    setLoading(true);
    try {
      const res = await fetch("/api/menu-repair-items/pricing/expiring-queue", {
        cache: "no-store",
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; rows?: QueueRow[]; error?: string }
        | null;

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? "Failed to load pricing queue");
      }

      setRows(json.rows ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load pricing queue");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadQueue();
  }, []);

  async function exportSelected() {
    if (selectedIds.length === 0) {
      toast.error("Select at least one repair item.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/menu-repair-items/pricing/export-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierName: supplierName.trim() || null,
          menuRepairItemIds: selectedIds,
        }),
      });

      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; batchId?: string; rowsInserted?: number; error?: string }
        | null;

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? "Failed to create export batch");
      }

      toast.success(
        `Created export batch ${json.batchId?.slice(0, 8) ?? ""} with ${json.rowsInserted ?? 0} row(s).`,
      );
      setSelected({});
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create export batch");
    } finally {
      setBusy(false);
    }
  }

  function toggle(id: string) {
    setSelected((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div className="space-y-4 p-4 text-white">
      <div className="rounded-xl border border-white/10 bg-black/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-neutral-100">Pricing Refresh Queue</h1>
            <p className="text-sm text-neutral-400">
              Stale and expired repair pricing that needs supplier refresh.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              placeholder="Supplier name"
              className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
            />
            <button
              type="button"
              onClick={() => void exportSelected()}
              disabled={busy || selectedIds.length === 0}
              className="rounded-lg border border-[#8b5a2b]/60 bg-black/30 px-3 py-2 text-sm font-semibold text-[#c88a4d] disabled:opacity-60"
            >
              {busy ? "Creating…" : "Create Export Batch"}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/30 p-4">
        {loading ? (
          <div className="text-sm text-neutral-400">Loading pricing queue…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-neutral-400">No stale or expired pricing found.</div>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => {
              const vehicle = [row.vehicleYear, row.vehicleMake, row.vehicleModel]
                .filter(Boolean)
                .join(" ");

              return (
                <label
                  key={row.menuRepairItemId}
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-white/10 bg-black/30 p-3"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(selected[row.menuRepairItemId])}
                    onChange={() => toggle(row.menuRepairItemId)}
                    className="mt-1"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-medium text-neutral-100">{row.name}</div>
                      <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs text-neutral-300">
                        {row.pricingStatus}
                      </span>
                    </div>

                    <div className="mt-1 text-sm text-neutral-400">
                      {vehicle || "Vehicle not set"}
                      {row.supplierName ? ` • ${row.supplierName}` : ""}
                    </div>

                    <div className="mt-1 text-xs text-neutral-500">
                      Valid until: {row.validUntil ?? "—"} • Days until expiry:{" "}
                      {row.daysUntilExpiry ?? "—"}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
