"use client";

import { CircleDollarSign, FileCheck2 } from "lucide-react";

import { WorkOrderInvoiceDownloadButton } from "@/features/work-orders/components/WorkOrderInvoiceDownloadButton";

export type WorkOrderInvoiceReviewStatus =
  | "passed"
  | "needs_attention"
  | "not_run";

const CAD_CURRENCY_FORMATTER = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 2,
});

function formatCurrency(value: number): string {
  return CAD_CURRENCY_FORMATTER.format(value);
}

function formatPaymentStatus(value: string | null): string {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (!normalized) return "Not recorded";
  return normalized
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function invoiceReviewLabel(status: WorkOrderInvoiceReviewStatus): string {
  switch (status) {
    case "passed":
      return "Invoice review passed";
    case "needs_attention":
      return "Invoice review needs attention";
    case "not_run":
      return "Invoice review not run";
  }
}

function FinancialStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
        {label}
      </div>
      <div className="mt-1 font-mono text-sm font-semibold text-[color:var(--theme-text-primary)]">
        {value}
      </div>
    </div>
  );
}

export function WorkOrderFinancialWorkspace({
  workOrderId,
  laborSubtotal,
  partsSubtotal,
  lineSubtotal,
  workOrderStatusLabel,
  paymentStatus,
  invoiceReviewStatus,
}: {
  workOrderId: string;
  laborSubtotal: number;
  partsSubtotal: number;
  lineSubtotal: number;
  workOrderStatusLabel: string;
  paymentStatus: string | null;
  invoiceReviewStatus: WorkOrderInvoiceReviewStatus;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--theme-text-muted)]">
            <CircleDollarSign
              className="h-4 w-4 text-[color:var(--brand-primary)]"
              aria-hidden="true"
            />
            Financials
          </div>
          <h3 className="mt-1 text-base font-semibold text-[color:var(--theme-text-primary)]">
            Current sell summary and invoice handoff
          </h3>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-[color:var(--theme-text-secondary)]">
            These values use the same active Work Order line pricing already
            shown here. Taxes and final issued totals remain authoritative in
            Invoice Preview.
          </p>
        </div>
        <WorkOrderInvoiceDownloadButton
          workOrderId={workOrderId}
          mode="preview"
          label="Open invoice preview"
          className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2 text-xs font-semibold text-[color:var(--theme-text-primary)] transition hover:bg-[color:var(--theme-surface-subtle)] disabled:opacity-60"
        />
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <FinancialStat
          label="Labor subtotal"
          value={formatCurrency(laborSubtotal)}
        />
        <FinancialStat
          label="Parts subtotal"
          value={formatCurrency(partsSubtotal)}
        />
        <FinancialStat
          label="Current line subtotal"
          value={formatCurrency(lineSubtotal)}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-[color:var(--theme-text-secondary)]">
        <span className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2.5 py-1">
          Work Order: {workOrderStatusLabel}
        </span>
        <span className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2.5 py-1">
          Payment: {formatPaymentStatus(paymentStatus)}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2.5 py-1">
          <FileCheck2 className="h-3.5 w-3.5" aria-hidden="true" />
          {invoiceReviewLabel(invoiceReviewStatus)}
        </span>
      </div>
    </div>
  );
}
