"use client";

import { useEffect, useState } from "react";

import type {
  PartsRequestWorkbenchItem,
  SupplierQuoteResponseLineInput,
} from "./types";
import {
  modalButton,
  modalInput,
  WorkbenchModalFrame,
} from "./WorkbenchModalFrame";

type DraftLine = SupplierQuoteResponseLineInput;

function initialLine(item: PartsRequestWorkbenchItem): DraftLine {
  return {
    partRequestItemId: item.id,
    status: "quoted",
    supplierPartNumber: item.requestedPartNumber ?? "",
    quotedUnitCost: item.unitCost ?? null,
    quotedSellPrice: item.sellPrice ?? null,
    availability: "Available",
    expectedAt: null,
  };
}

export function SupplierQuoteResponseModal({
  open,
  supplierName,
  items,
  busy,
  onSubmit,
  onClose,
}: {
  open: boolean;
  supplierName: string;
  items: PartsRequestWorkbenchItem[];
  busy?: boolean;
  onSubmit: (input: {
    items: SupplierQuoteResponseLineInput[];
    notes: string;
  }) => void;
  onClose: () => void;
}): JSX.Element | null {
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setLines(items.map(initialLine));
    setNotes("");
  }, [items, open]);

  function updateLine(itemId: string, patch: Partial<DraftLine>): void {
    setLines((current) =>
      current.map((line) =>
        line.partRequestItemId === itemId ? { ...line, ...patch } : line,
      ),
    );
  }

  const invalid = lines.some(
    (line) =>
      line.status === "quoted" &&
      (line.quotedUnitCost == null || line.quotedSellPrice == null),
  );

  return (
    <WorkbenchModalFrame
      open={open}
      eyebrow="Supplier response"
      title={`Record quote from ${supplierName}`}
      onClose={busy ? undefined : onClose}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className={modalButton}
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-lg border border-emerald-500/40 bg-emerald-600/85 px-4 py-2 text-sm font-semibold text-[color:var(--theme-text-primary)] hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={busy || lines.length === 0 || invalid}
            onClick={() => onSubmit({ items: lines, notes })}
          >
            {busy ? "Recording quote..." : "Record supplier quote"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
          {items.map((item) => {
            const line = lines.find(
              (candidate) => candidate.partRequestItemId === item.id,
            );
            if (!line) return null;
            const unavailable = line.status === "unavailable";
            return (
              <div
                key={item.id}
                className="rounded-lg border border-[color:var(--theme-border-soft)] p-3"
              >
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-[color:var(--theme-text-primary)]">
                      {item.description}
                    </div>
                    <div className="text-xs text-[color:var(--theme-text-secondary)]">
                      Requested qty {item.qty}
                    </div>
                  </div>
                  <select
                    aria-label={`${item.description} response status`}
                    className={`${modalInput} w-auto`}
                    value={line.status}
                    disabled={busy}
                    onChange={(event) =>
                      updateLine(item.id, {
                        status: event.target.value as DraftLine["status"],
                      })
                    }
                  >
                    <option value="quoted">Quoted</option>
                    <option value="unavailable">Unavailable</option>
                  </select>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="space-y-1 text-xs text-[color:var(--theme-text-secondary)]">
                    <span>Supplier part #</span>
                    <input
                      className={modalInput}
                      value={line.supplierPartNumber ?? ""}
                      disabled={busy}
                      onChange={(event) =>
                        updateLine(item.id, {
                          supplierPartNumber: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label className="space-y-1 text-xs text-[color:var(--theme-text-secondary)]">
                    <span>Supplier unit cost</span>
                    <input
                      aria-label={`${item.description} supplier unit cost`}
                      className={modalInput}
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.quotedUnitCost ?? ""}
                      disabled={busy || unavailable}
                      onChange={(event) =>
                        updateLine(item.id, {
                          quotedUnitCost:
                            event.target.value === ""
                              ? null
                              : Number(event.target.value),
                        })
                      }
                    />
                  </label>
                  <label className="space-y-1 text-xs text-[color:var(--theme-text-secondary)]">
                    <span>Customer sell price</span>
                    <input
                      aria-label={`${item.description} customer sell price`}
                      className={modalInput}
                      type="number"
                      min="0"
                      step="0.01"
                      value={line.quotedSellPrice ?? ""}
                      disabled={busy || unavailable}
                      onChange={(event) =>
                        updateLine(item.id, {
                          quotedSellPrice:
                            event.target.value === ""
                              ? null
                              : Number(event.target.value),
                        })
                      }
                    />
                  </label>
                  <label className="space-y-1 text-xs text-[color:var(--theme-text-secondary)]">
                    <span>ETA</span>
                    <input
                      className={modalInput}
                      type="date"
                      value={line.expectedAt ?? ""}
                      disabled={busy || unavailable}
                      onChange={(event) =>
                        updateLine(item.id, {
                          expectedAt: event.target.value || null,
                        })
                      }
                    />
                  </label>
                </div>
                <label className="mt-3 block space-y-1 text-xs text-[color:var(--theme-text-secondary)]">
                  <span>Availability</span>
                  <input
                    className={modalInput}
                    value={line.availability ?? ""}
                    disabled={busy}
                    onChange={(event) =>
                      updateLine(item.id, { availability: event.target.value })
                    }
                  />
                </label>
              </div>
            );
          })}
        </div>

        <label className="block space-y-1 text-sm text-[color:var(--theme-text-secondary)]">
          <span>Supplier notes</span>
          <textarea
            className={`${modalInput} min-h-20`}
            value={notes}
            maxLength={4000}
            disabled={busy}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
      </div>
    </WorkbenchModalFrame>
  );
}
