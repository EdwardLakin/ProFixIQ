"use client";

import { useMemo, useState } from "react";
import { Pencil, X } from "lucide-react";

type PricingSnapshot = {
  shopSuppliesTotal?: number | null;
  lines?: Array<{
    id: string;
    description?: string | null;
    complaint?: string | null;
    resolvedLaborTotal?: number;
  }>;
  parts?: Array<{
    id: string;
    pricingSourceId?: string;
    name?: string;
    qty?: number;
    unitPrice?: number;
  }>;
};

type Props<TSnapshot extends PricingSnapshot> = {
  workOrderId: string;
  snapshot: TSnapshot;
  onSaved: (snapshot: TSnapshot) => void;
};

function money(value: unknown): string {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount.toFixed(2) : "0.00";
}

export default function InvoicePricingEditor<
  TSnapshot extends PricingSnapshot,
>({ workOrderId, snapshot, onSaved }: Props<TSnapshot>) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initialLabor = useMemo(
    () =>
      Object.fromEntries(
        (snapshot.lines ?? []).map((line) => [
          line.id,
          money(line.resolvedLaborTotal),
        ]),
      ),
    [snapshot.lines],
  );
  const initialParts = useMemo(
    () =>
      Object.fromEntries(
        (snapshot.parts ?? []).map((part) => [
          part.pricingSourceId ?? part.id,
          money(part.unitPrice),
        ]),
      ),
    [snapshot.parts],
  );
  const [lineLaborTotals, setLineLaborTotals] = useState(initialLabor);
  const [partUnitPrices, setPartUnitPrices] = useState(initialParts);
  const [shopSuppliesAmount, setShopSuppliesAmount] = useState(
    money(snapshot.shopSuppliesTotal),
  );

  const show = () => {
    setLineLaborTotals(initialLabor);
    setPartUnitPrices(initialParts);
    setShopSuppliesAmount(money(snapshot.shopSuppliesTotal));
    setError(null);
    setOpen(true);
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/invoices/pricing-overrides", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workOrderId,
          lineLaborTotals,
          partUnitPrices,
          shopSuppliesAmount,
        }),
      });
      const result = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        snapshot?: TSnapshot;
      } | null;
      if (!response.ok || !result?.ok || !result.snapshot) {
        throw new Error(result?.error ?? "Invoice pricing could not be saved.");
      }
      onSaved(result.snapshot);
      setOpen(false);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Invoice pricing could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={show}
        className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--theme-border-soft)] px-3 py-1.5 text-xs font-semibold text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-hover)]"
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
        Edit pricing
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Edit invoice pricing"
        >
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface)] shadow-2xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface)] px-4 py-3">
              <div>
                <h2 className="text-base font-semibold text-[color:var(--theme-text-primary)]">
                  Invoice pricing
                </h2>
                <p className="text-xs text-[color:var(--theme-text-secondary)]">
                  Overrides apply to this invoice only and lock when finalized.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded p-1.5 hover:bg-[color:var(--theme-surface-hover)]"
                aria-label="Close pricing editor"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-5 p-4">
              {(snapshot.lines ?? []).length > 0 ? (
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase text-[color:var(--theme-text-secondary)]">
                    Labor totals
                  </h3>
                  <div className="divide-y divide-[color:var(--theme-border-soft)] rounded border border-[color:var(--theme-border-soft)]">
                    {(snapshot.lines ?? []).map((line) => (
                      <label
                        key={line.id}
                        className="grid grid-cols-[1fr_120px] items-center gap-3 px-3 py-2 text-sm"
                      >
                        <span className="min-w-0 truncate text-[color:var(--theme-text-primary)]">
                          {line.description || line.complaint || "Labor line"}
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={lineLaborTotals[line.id] ?? "0.00"}
                          onChange={(event) =>
                            setLineLaborTotals((current) => ({
                              ...current,
                              [line.id]: event.target.value,
                            }))
                          }
                          className="w-full rounded border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-1.5 text-right"
                          aria-label={`Labor total for ${line.description || line.complaint || "line"}`}
                        />
                      </label>
                    ))}
                  </div>
                </section>
              ) : null}

              {(snapshot.parts ?? []).length > 0 ? (
                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase text-[color:var(--theme-text-secondary)]">
                    Part unit prices
                  </h3>
                  <div className="divide-y divide-[color:var(--theme-border-soft)] rounded border border-[color:var(--theme-border-soft)]">
                    {(snapshot.parts ?? []).map((part) => {
                      const key = part.pricingSourceId ?? part.id;
                      return (
                        <label
                          key={part.id}
                          className="grid grid-cols-[1fr_120px] items-center gap-3 px-3 py-2 text-sm"
                        >
                          <span className="min-w-0 truncate text-[color:var(--theme-text-primary)]">
                            {part.name || "Part"} ({Number(part.qty ?? 0)} qty)
                          </span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={partUnitPrices[key] ?? "0.00"}
                            onChange={(event) =>
                              setPartUnitPrices((current) => ({
                                ...current,
                                [key]: event.target.value,
                              }))
                            }
                            className="w-full rounded border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-1.5 text-right"
                            aria-label={`Unit price for ${part.name || "part"}`}
                          />
                        </label>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              <label className="grid grid-cols-[1fr_120px] items-center gap-3 text-sm">
                <span className="text-[color:var(--theme-text-primary)]">
                  Shop supplies
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={shopSuppliesAmount}
                  onChange={(event) =>
                    setShopSuppliesAmount(event.target.value)
                  }
                  className="w-full rounded border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-1.5 text-right"
                />
              </label>
              {error ? (
                <p role="alert" className="text-sm text-red-400">
                  {error}
                </p>
              ) : null}
            </div>

            <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface)] px-4 py-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded border border-[color:var(--theme-border-soft)] px-3 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className="rounded bg-[color:var(--brand-primary,#1747FF)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save pricing"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
