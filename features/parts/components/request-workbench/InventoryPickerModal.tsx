"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import type { WorkbenchOption } from "./types";
import { modalButton, modalInput, modalPrimaryButton } from "./WorkbenchModalFrame";

const INVENTORY_PICKER_RESULT_LIMIT = 50;

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
  onAttach?: (result: InventoryPickerResult) => Promise<void> | void;
  onClose?: () => void;
}): JSX.Element | null {
  const titleId = useId();
  const descriptionId = useId();
  const searchRef = useRef<HTMLInputElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const selected = results.find((result) => result.value === selectedPartId) ?? null;
  const selectedOnHand = selected?.onHandQty;
  const onHand = Number(selectedOnHand ?? 0);
  const stockUnknown = selectedOnHand == null;
  const zeroStock = !!selected && !stockUnknown && onHand <= 0;
  const displayedResults = useMemo(
    () => results.slice(0, INVENTORY_PICKER_RESULT_LIMIT),
    [results],
  );
  const resultCountSummary = results.length > displayedResults.length
    ? `Showing ${displayedResults.length} of ${results.length} results. Refine search to narrow matches.`
    : `${results.length} result${results.length === 1 ? "" : "s"}`;

  useEffect(() => {
    if (!open) return;
    submittingRef.current = false;
    setSubmitting(false);
    setSubmitError(null);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => searchRef.current?.focus(), 0);

    return () => {
      window.clearTimeout(focusTimer);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose?.();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute("disabled") && element.offsetParent !== null);

      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  async function handleAttach(): Promise<void> {
    if (!selectedPartId || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onAttach?.({ partId: selectedPartId, warningAccepted: zeroStock });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not attach inventory part.";
      setSubmitError(message);
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-[color:var(--theme-surface-overlay)] backdrop-blur-sm" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="fixed left-1/2 top-1/2 z-[71] flex max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-1rem)] w-[min(920px,calc(100vw-env(safe-area-inset-left)-env(safe-area-inset-right)-1rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] shadow-2xl supports-[height:100dvh]:max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-1rem)]"
      >
        <div className="shrink-0 border-b border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-4 py-3 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-[0.18em] text-[color:var(--theme-text-muted)]">Parts Workbench</div>
              <h2 id={titleId} className="mt-1 truncate text-lg font-semibold text-[color:var(--theme-text-primary)]">{title}</h2>
            </div>
            <button type="button" onClick={onClose} className="min-h-11 shrink-0 rounded-lg border border-[color:var(--theme-border-soft)] px-3 py-2 text-sm text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-subtle)] focus:outline-none focus:ring-2 focus:ring-sky-500/50">
              Close
            </button>
          </div>
          <p id={descriptionId} className="mt-2 text-sm text-[color:var(--theme-text-secondary)]">Search existing parts by description, SKU, part number, or manufacturer.</p>
          <input
            ref={searchRef}
            className={`${modalInput} mt-3 min-h-11`}
            value={query ?? ""}
            placeholder="Search inventory..."
            aria-label="Search inventory"
            onChange={(event) => onQueryChange?.(event.target.value)}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[color:var(--theme-text-secondary)]">
            <span>{resultCountSummary}</span>
            {selected ? <span className="rounded-full border border-orange-400/30 bg-orange-500/10 px-2 py-1 text-orange-100">Selected: {selected.label}</span> : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5" data-testid="inventory-picker-results-body">
          {zeroStock ? (
            <div className="mb-3 rounded-xl border border-amber-400/30 bg-amber-950/25 p-3 text-sm text-amber-100">
              This part has zero stock. You can still attach it to preserve the match and order/receive later.
            </div>
          ) : null}
          {submitError ? (
            <div role="alert" className="mb-3 rounded-xl border border-red-400/30 bg-red-950/25 p-3 text-sm text-red-100">
              {submitError}
            </div>
          ) : null}

          <div className="space-y-1.5">
            {displayedResults.length ? displayedResults.map((result) => {
              const checked = selectedPartId === result.value;
              const metadata = [result.partNumber || result.sku, result.manufacturer].filter(Boolean).join(" • ") || "No part metadata";
              const onHandText = result.onHandQty == null ? "On hand unavailable" : `${Number(result.onHandQty)} on hand`;
              return (
                <label
                  key={result.value}
                  className={`block min-h-11 cursor-pointer rounded-xl border px-3 py-2 focus-within:ring-2 focus-within:ring-sky-500/50 ${checked ? "border-orange-400/70 bg-orange-500/15 shadow-[0_0_0_1px_rgba(251,146,60,0.35)]" : "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] hover:bg-[color:var(--theme-surface-subtle)]"}`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="inventory-picker-part"
                      className="h-4 w-4 shrink-0 accent-orange-500"
                      checked={checked}
                      aria-label={`${result.label}. ${metadata}. ${onHandText}`}
                      onChange={() => onSelectedPartChange?.(result.value)}
                    />
                    <div className="grid min-w-0 flex-1 gap-0.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-x-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-[color:var(--theme-text-primary)]">{result.label}</div>
                        <div className="truncate text-xs text-[color:var(--theme-text-secondary)]">{metadata}</div>
                      </div>
                      <div className="text-xs font-medium text-[color:var(--theme-text-primary)] sm:text-right">{onHandText}</div>
                    </div>
                    {checked ? <span className="text-xs font-semibold text-orange-100">Selected</span> : null}
                  </div>
                </label>
              );
            }) : (
              <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-4 text-sm text-[color:var(--theme-text-secondary)]">
                No inventory results loaded yet.
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-5">
          <div className="mb-2 min-h-5 text-xs text-[color:var(--theme-text-secondary)]">
            {selected ? <>Ready to attach <span className="font-semibold text-[color:var(--theme-text-primary)]">{selected.label}</span>{selected.partNumber || selected.sku ? <> · {selected.partNumber || selected.sku}</> : null}</> : "Select an inventory part to enable attachment."}
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button type="button" className={`${modalButton} min-h-11`} onClick={onClose}>Cancel</button>
            <button
              type="button"
              className={`${modalPrimaryButton} min-h-11 disabled:cursor-not-allowed disabled:opacity-50`}
              disabled={!selectedPartId || submitting}
              onClick={() => void handleAttach()}
            >
              {submitting ? "Attaching…" : "Attach Selected Part"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
