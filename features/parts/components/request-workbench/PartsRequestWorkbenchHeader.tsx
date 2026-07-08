"use client";

import Link from "next/link";
import type { WorkbenchOption } from "./types";

export function PartsRequestWorkbenchHeader({
  requestLabel,
  status,
  workOrderId,
  workOrderCustomId,
  jobContext,
  createdBy,
  createdAt,
  defaultSupplierId,
  supplierOptions,
  onDefaultSupplierChange,
  onCreatePo,
}: {
  requestLabel: string;
  status?: string | null;
  workOrderId?: string | null;
  workOrderCustomId?: string | null;
  jobContext?: string | null;
  createdBy?: string | null;
  createdAt?: string | null;
  defaultSupplierId?: string | null;
  supplierOptions: WorkbenchOption[];
  onDefaultSupplierChange?: (supplierId: string) => void;
  onCreatePo?: () => void;
}): JSX.Element {
  const meta = [
    workOrderCustomId ? `Work Order: ${workOrderCustomId}` : null,
    jobContext,
    createdAt ? `Created ${createdAt}${createdBy ? ` by ${createdBy}` : ""}` : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="text-xs text-neutral-400">Parts Requests › {requestLabel}</div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-white">Parts Request {requestLabel}</h1>
          {status ? (
            <span className="rounded-full border border-sky-400/35 bg-sky-950/25 px-3 py-1 text-xs font-medium text-sky-100">
              {status}
            </span>
          ) : null}
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-sm text-neutral-400">
          {meta.map((item) => (
            <span key={String(item)}>{item}</span>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {workOrderId ? (
          <Link
            href={`/work-orders/${workOrderId}`}
            className="rounded-lg border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-2 text-sm text-neutral-100 hover:bg-white/5"
          >
            View Work Order
          </Link>
        ) : null}

        <select
          className="rounded-lg border border-[color:var(--desktop-border)] bg-[color:var(--desktop-item-bg)] px-3 py-2 text-sm text-white"
          value={defaultSupplierId ?? ""}
          onChange={(event) => onDefaultSupplierChange?.(event.target.value)}
          title="Default supplier"
        >
          <option value="">Default supplier</option>
          {supplierOptions.map((supplier) => (
            <option key={supplier.value} value={supplier.value}>
              {supplier.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={onCreatePo}
          className="rounded-lg border border-orange-500/40 bg-orange-600/85 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500"
        >
          Create PO
        </button>
      </div>
    </div>
  );
}
