"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

type InvoiceVersionSummary = {
  id: string;
  lifecycle_status: string;
  currency: "CAD" | "USD";
  total: number;
  paid_total: number;
  outstanding_total: number;
};

type Props = {
  workOrderId: string;
  currency: "CAD" | "USD";
  outstandingTotal: number;
  disabled?: boolean;
  onPosted?: (invoiceVersion: InvoiceVersionSummary) => void;
};

const PAYMENT_METHODS = [
  ["terminal", "Card terminal"],
  ["cash", "Cash"],
  ["cheque", "Cheque"],
  ["eft", "EFT / e-transfer"],
  ["financing", "Financing"],
  ["other", "Other"],
] as const;

function formatMoney(value: number, currency: "CAD" | "USD"): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
  }).format(value);
}

export default function RecordManualPayment({
  workOrderId,
  currency,
  outstandingTotal,
  disabled = false,
  onPosted,
}: Props): JSX.Element {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState(String(outstandingTotal.toFixed(2)));
  const [method, setMethod] = useState<(typeof PAYMENT_METHODS)[number][0]>(
    "terminal",
  );
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    setAmount(String(Math.max(0, outstandingTotal).toFixed(2)));
  }, [outstandingTotal]);

  const parsedAmount = useMemo(() => Number(amount), [amount]);
  const canSubmit =
    !disabled &&
    !busy &&
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0 &&
    parsedAmount <= outstandingTotal + 0.01;

  async function submitPayment(): Promise<void> {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const idempotencyKey =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${workOrderId}:${Date.now()}`;
      const response = await fetch("/api/payments/manual", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          workOrderId,
          amount: parsedAmount,
          method,
          reference: reference.trim() || null,
          note: note.trim() || null,
          idempotencyKey,
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string; invoice_version?: InvoiceVersionSummary }
        | null;
      if (!response.ok || !body?.invoice_version) {
        throw new Error(body?.error ?? "Payment could not be recorded.");
      }

      toast.success(
        `${formatMoney(parsedAmount, currency)} recorded as ${
          PAYMENT_METHODS.find(([value]) => value === method)?.[1] ?? method
        } payment.`,
      );
      setOpen(false);
      setReference("");
      setNote("");
      onPosted?.(body.invoice_version);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Payment could not be recorded.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (outstandingTotal <= 0.005) {
    return (
      <span className="rounded-full border border-emerald-400/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-100">
        Paid in full
      </span>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        className="rounded-full border border-emerald-400/70 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-100 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Record POS payment
      </button>

      {open ? (
        <div className="absolute right-0 top-11 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] p-4 shadow-[var(--theme-shadow-strong)]">
          <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
            Record external payment
          </div>
          <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
            Outstanding: {formatMoney(outstandingTotal, currency)}
          </div>

          <label className="mt-3 block text-xs text-[color:var(--theme-text-secondary)]">
            Amount
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              className="desktop-input mt-1 w-full px-3 py-2 text-sm"
            />
          </label>

          <label className="mt-3 block text-xs text-[color:var(--theme-text-secondary)]">
            Method
            <select
              value={method}
              onChange={(event) =>
                setMethod(event.target.value as (typeof PAYMENT_METHODS)[number][0])
              }
              className="desktop-input mt-1 w-full px-3 py-2 text-sm"
            >
              {PAYMENT_METHODS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="mt-3 block text-xs text-[color:var(--theme-text-secondary)]">
            Reference (optional)
            <input
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              className="desktop-input mt-1 w-full px-3 py-2 text-sm"
              placeholder="Terminal receipt or cheque number"
            />
          </label>

          <label className="mt-3 block text-xs text-[color:var(--theme-text-secondary)]">
            Note (optional)
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="desktop-input mt-1 w-full px-3 py-2 text-sm"
            />
          </label>

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full border border-[color:var(--theme-border-soft)] px-3 py-1.5 text-xs text-[color:var(--theme-text-primary)]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => void submitPayment()}
              className="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Recording…" : "Record payment"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
