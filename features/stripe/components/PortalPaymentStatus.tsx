"use client";

import { useEffect, useState } from "react";

type Receipt = {
  id: string;
  receipt_number: string;
  amount: number;
  currency: string;
  payment_method: string | null;
  processor_reference: string | null;
  received_at: string;
  remaining_balance: number;
};

type SessionState = {
  state?: string;
  receipt?: Receipt | null;
  error?: string;
};

function money(value: number, currency: string) {
  const normalized = currency.toUpperCase() === "CAD" ? "CAD" : "USD";
  return new Intl.NumberFormat(normalized === "CAD" ? "en-CA" : "en-US", {
    style: "currency",
    currency: normalized,
  }).format(Number(value ?? 0));
}

export default function PortalPaymentStatus({ sessionId }: { sessionId: string }) {
  const [state, setState] = useState<SessionState>({ state: "processing" });

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const load = async () => {
      attempts += 1;
      const response = await fetch(`/api/portal/payments/session/${encodeURIComponent(sessionId)}`, {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as SessionState | null;
      if (cancelled) return;
      if (!response.ok || !payload) {
        setState({ error: payload?.error ?? "Unable to verify payment" });
        return;
      }
      setState(payload);
      if (payload.state !== "succeeded" && attempts < 12) {
        timer = setTimeout(load, 1500);
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [sessionId]);

  if (state.error) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
        {state.error}
      </div>
    );
  }

  if (state.state !== "succeeded" || !state.receipt) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
        Payment received by Stripe. ProFixIQ is confirming the ledger entry and receipt.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-4 text-sm text-emerald-50">
      <div className="font-semibold">Payment confirmed</div>
      <div className="mt-1">Receipt {state.receipt.receipt_number}</div>
      <div className="mt-1">
        Paid {money(state.receipt.amount, state.receipt.currency)} • Remaining balance {money(state.receipt.remaining_balance, state.receipt.currency)}
      </div>
    </div>
  );
}
