"use client";

import React from "react";
import type { WorkbenchOption } from "./types";
import { WorkbenchModalFrame, modalButton, modalInput, modalPrimaryButton } from "./WorkbenchModalFrame";

export type InventoryPickerResult = {
  partId: string;
  warningAccepted: boolean;
};

export type InventorySearchResult = WorkbenchOption & {
  sku?: string | null;
  partNumber?: string | null;
  manufacturer?: string | null;
  onHandQty?: number | null;
};

export function InventoryPickerModal({
  open,
  title = "Attach Part",
  results = [],
  query,
  onQueryChange,
  selectedPartId,
  onSelectedPartChange,
  onAttach,
  onClose,
}: {
  open: boolean;
  title?: string;
  results?: InventorySearchResult[];
  query?: string;
  onQueryChange?: (query: string) => void;
  selectedPartId?: string | null;
  onSelectedPartChange?: (partId: string) => void;
  onAttach?: (result: InventoryPickerResult) => void;
  onClose?: () => void;
}): JSX.Element | null {
  const selected = results.find((result) => result.value === selectedPartId) ?? null;
  const selectedOnHand = selected?.onHandQty;
  const onHand = Number(selectedOnHand ?? 0);
  const stockUnknown = selectedOnHand == null;
  const zeroStock = !!selected && !stockUnknown && onHand <= 0;

  return (
    <WorkbenchModalFrame
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button type="button" className={modalButton} onClick={onClose}>Cancel</button>
          <button
            type="button"
            className={modalPrimaryButton}
            disabled={!selectedPartId}
            onClick={() => selectedPartId && onAttach?.({ partId: selectedPartId, warningAccepted: zeroStock })}
          >
            Attach Part
          </button>
        </div>
      }
    >
      <div className="space-y-4 text-sm text-neutral-300">
        <p>Search existing parts by description, SKU, part number, or manufacturer.</p>
        <input
          className={modalInput}
          value={query ?? ""}
          placeholder="Search inventory..."
          onChange={(event) => onQueryChange?.(event.target.value)}
        />

        {zeroStock ? (
          <div className="rounded-xl border border-amber-400/30 bg-amber-950/25 p-3 text-amber-100">
            This part has zero stock. You can still attach it to preserve the match and order/receive later.
          </div>
        ) : null}

        <div className="space-y-2">
          {results.length ? results.map((result) => (
            <label key={result.value} className="block rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="flex gap-3">
                <input
                  type="radio"
                  checked={selectedPartId === result.value}
                  onChange={() => onSelectedPartChange?.(result.value)}
                />
                <div className="min-w-0">
                  <div className="font-medium text-white">{result.label}</div>
                  <div className="mt-1 text-xs text-neutral-400">
                    {[result.sku, result.partNumber, result.manufacturer].filter(Boolean).join(" • ") || "No part metadata"}
                  </div>
                  <div className="mt-1 text-xs text-neutral-300">
                    On hand: {result.onHandQty == null ? "Unavailable" : Number(result.onHandQty)}
                  </div>
                </div>
              </div>
            </label>
          )) : (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-neutral-400">
              No inventory results loaded yet.
            </div>
          )}
        </div>
      </div>
    </WorkbenchModalFrame>
  );
}
