"use client";

import { Mail, Phone } from "lucide-react";

import type {
  PartsRequestWorkbenchItem,
  SupplierQuoteChannel,
  WorkbenchOption,
} from "./types";
import {
  modalButton,
  modalInput,
  WorkbenchModalFrame,
} from "./WorkbenchModalFrame";

export function SupplierQuoteRequestModal({
  open,
  supplierId,
  supplierOptions,
  items,
  busyChannel,
  onSupplierChange,
  onSubmit,
  onClose,
}: {
  open: boolean;
  supplierId: string;
  supplierOptions: WorkbenchOption[];
  items: PartsRequestWorkbenchItem[];
  busyChannel?: SupplierQuoteChannel | null;
  onSupplierChange: (supplierId: string) => void;
  onSubmit: (channel: SupplierQuoteChannel) => void;
  onClose: () => void;
}): JSX.Element | null {
  const isBusy = busyChannel != null;

  return (
    <WorkbenchModalFrame
      open={open}
      eyebrow="Supplier sourcing"
      title={`Request quote for ${items.length} ${items.length === 1 ? "item" : "items"}`}
      onClose={isBusy ? undefined : onClose}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            className={modalButton}
            onClick={onClose}
            disabled={isBusy}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`${modalButton} inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50`}
            onClick={() => onSubmit("phone")}
            disabled={!supplierId || isBusy}
          >
            <Phone aria-hidden="true" className="h-4 w-4" />
            {busyChannel === "phone" ? "Recording call..." : "Call supplier"}
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-600/85 px-4 py-2 text-sm font-semibold text-[color:var(--theme-text-primary)] hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => onSubmit("email")}
            disabled={!supplierId || isBusy}
          >
            <Mail aria-hidden="true" className="h-4 w-4" />
            {busyChannel === "email" ? "Preparing email..." : "Prepare quote email"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-[color:var(--theme-text-primary)]">
            Supplier
          </span>
          <select
            aria-label="Supplier"
            className={modalInput}
            value={supplierId}
            onChange={(event) => onSupplierChange(event.target.value)}
            disabled={isBusy}
          >
            <option value="">Select supplier</option>
            {supplierOptions.map((supplier) => (
              <option key={supplier.value} value={supplier.value}>
                {supplier.label}
              </option>
            ))}
          </select>
        </label>

        <div className="overflow-hidden rounded-lg border border-[color:var(--theme-border-soft)]">
          <div className="border-b border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 py-2 text-xs font-medium text-[color:var(--theme-text-secondary)]">
            Selected parts
          </div>
          <div className="max-h-64 divide-y divide-[color:var(--theme-border-soft)] overflow-y-auto">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between gap-3 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-[color:var(--theme-text-primary)]">
                    {item.description}
                  </div>
                  <div className="text-xs text-[color:var(--theme-text-secondary)]">
                    {[item.requestedPartNumber, item.requestedManufacturer]
                      .filter(Boolean)
                      .join(" | ") || "No part number supplied"}
                  </div>
                </div>
                <div className="shrink-0 text-[color:var(--theme-text-secondary)]">
                  Qty {item.qty}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </WorkbenchModalFrame>
  );
}
