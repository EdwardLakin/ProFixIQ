"use client";

import { CircleDollarSign, FileCheck2 } from "lucide-react";
import { useEffect, useState } from "react";

import { WorkOrderInvoiceDownloadButton } from "@/features/work-orders/components/WorkOrderInvoiceDownloadButton";

type InvoiceCurrency = "CAD" | "USD";

type FinancialSnapshotSummary = {
  currency: InvoiceCurrency;
  laborSubtotal: number;
  partsSubtotal: number;
  invoiceSubtotal: number;
};

type FinancialSnapshotState =
  | { status: "loading" }
  | { status: "ready"; summary: FinancialSnapshotSummary }
  | { status: "error"; message: string };

const CURRENCY_FORMATTERS: Record<InvoiceCurrency, Intl.NumberFormat> = {
  CAD: new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 2,
  }),
  USD: new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }),
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseFinancialSnapshot(payload: unknown): FinancialSnapshotSummary {
  const snapshot = asRecord(asRecord(payload)?.snapshot);
  const rawCurrency =
    typeof snapshot?.currency === "string"
      ? snapshot.currency.toUpperCase()
      : "";
  const currency: InvoiceCurrency | null =
    rawCurrency === "CAD" || rawCurrency === "USD" ? rawCurrency : null;
  const laborSubtotal = asFiniteNumber(snapshot?.laborCost);
  const partsSubtotal = asFiniteNumber(snapshot?.partsCost);
  const invoiceSubtotal = asFiniteNumber(snapshot?.subtotal);

  if (
    !currency ||
    laborSubtotal === null ||
    partsSubtotal === null ||
    invoiceSubtotal === null
  ) {
    throw new Error("Canonical invoice pricing is unavailable");
  }

  return { currency, laborSubtotal, partsSubtotal, invoiceSubtotal };
}

function formatCurrency(value: number, currency: InvoiceCurrency): string {
  return CURRENCY_FORMATTERS[currency].format(value);
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
  workOrderStatusLabel,
  paymentStatus,
}: {
  workOrderId: string;
  workOrderStatusLabel: string;
  paymentStatus: string | null;
}) {
  const [snapshotState, setSnapshotState] = useState<FinancialSnapshotState>({
    status: "loading",
  });

  useEffect(() => {
    let activeController: AbortController | null = null;

    const loadSnapshot = async () => {
      activeController?.abort();
      const controller = new AbortController();
      activeController = controller;
      setSnapshotState({ status: "loading" });
      try {
        const response = await fetch(
          `/api/work-orders/${encodeURIComponent(workOrderId)}/invoice`,
          {
            method: "GET",
            cache: "no-store",
            credentials: "same-origin",
            headers: { Accept: "application/json" },
            signal: controller.signal,
          },
        );
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const errorPayload = asRecord(payload);
          throw new Error(
            typeof errorPayload?.error === "string"
              ? errorPayload.error
              : "Unable to load canonical invoice pricing",
          );
        }

        const summary = parseFinancialSnapshot(payload);
        if (!controller.signal.aborted) {
          setSnapshotState({ status: "ready", summary });
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setSnapshotState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Unable to load canonical invoice pricing",
        });
      }
    };

    const refreshVisibleSnapshot = () => {
      if (document.visibilityState === "visible") {
        void loadSnapshot();
      }
    };

    void loadSnapshot();
    window.addEventListener("focus", refreshVisibleSnapshot);
    document.addEventListener("visibilitychange", refreshVisibleSnapshot);

    return () => {
      activeController?.abort();
      window.removeEventListener("focus", refreshVisibleSnapshot);
      document.removeEventListener("visibilitychange", refreshVisibleSnapshot);
    };
  }, [workOrderId]);

  const laborValue =
    snapshotState.status === "ready"
      ? formatCurrency(
          snapshotState.summary.laborSubtotal,
          snapshotState.summary.currency,
        )
      : snapshotState.status === "loading"
        ? "Loading…"
        : "Unavailable";
  const partsValue =
    snapshotState.status === "ready"
      ? formatCurrency(
          snapshotState.summary.partsSubtotal,
          snapshotState.summary.currency,
        )
      : snapshotState.status === "loading"
        ? "Loading…"
        : "Unavailable";
  const invoiceSubtotalValue =
    snapshotState.status === "ready"
      ? formatCurrency(
          snapshotState.summary.invoiceSubtotal,
          snapshotState.summary.currency,
        )
      : snapshotState.status === "loading"
        ? "Loading…"
        : "Unavailable";

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
            These values come from the canonical snapshot used by Invoice
            Preview, including saved pricing overrides and issued totals.
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
        <FinancialStat label="Labor subtotal" value={laborValue} />
        <FinancialStat label="Parts subtotal" value={partsValue} />
        <FinancialStat label="Invoice subtotal" value={invoiceSubtotalValue} />
      </div>

      {snapshotState.status === "error" ? (
        <p
          role="alert"
          className="mt-3 text-xs text-[color:var(--theme-text-secondary)]"
        >
          {snapshotState.message}. Open Invoice Preview to retry.
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-[color:var(--theme-text-secondary)]">
        <span className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2.5 py-1">
          Work Order: {workOrderStatusLabel}
        </span>
        <span className="rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2.5 py-1">
          Payment: {formatPaymentStatus(paymentStatus)}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2.5 py-1">
          <FileCheck2 className="h-3.5 w-3.5" aria-hidden="true" />
          {snapshotState.status === "ready"
            ? `Canonical invoice snapshot · ${snapshotState.summary.currency}`
            : "Canonical invoice snapshot"}
        </span>
      </div>
    </div>
  );
}
