// features/stripe/components/PortalInvoicePayButton.tsx (FULL FILE REPLACEMENT)
"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

type Props = {
  shopId: string;
  workOrderId: string;
  amountCents: number;
  currency: "usd" | "cad";
  disabled?: boolean;
};

export default function PortalInvoicePayButton({
  shopId,
  workOrderId,
  amountCents,
  currency,
  disabled,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  const labelCurrency = useMemo(() => (currency === "cad" ? "CAD" : "USD"), [currency]);

  async function startCheckout(): Promise<void> {
    if (busy || disabled) return;

    setInlineError(null);

    if (!Number.isFinite(amountCents) || amountCents < 50) {
      setInlineError("Invoice total is not payable (amount too low).");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/portal/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId,
          workOrderId,
          amountCents,
          currency,
        }),
      });

      const j = (await res.json().catch(() => ({}))) as { url?: string; error?: string };

      if (!res.ok || !j.url) {
        // ✅ Inline for “not connected/onboarding”
        if (res.status === 409) {
          setInlineError(j.error || "Payments are not enabled for this shop yet.");
          return;
        }

        // Other errors can still toast
        toast.error(j.error || "Failed to start checkout.");
        return;
      }

      window.location.href = j.url;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-300">
            Payment
          </div>
          <div className="mt-1 text-sm text-neutral-200">
            Pay your invoice with card • {labelCurrency}
          </div>
          <div className="mt-0.5 text-[11px] text-neutral-500">
            You’ll be redirected to Stripe Checkout.
          </div>
        </div>

        <button
          type="button"
          onClick={() => void startCheckout()}
          disabled={busy || disabled}
          className={
            "rounded-xl px-4 py-2 text-sm font-semibold border " +
            (busy || disabled
              ? "border-white/10 bg-black/30 text-neutral-500"
              : "border-white/20 bg-black/50 text-white hover:bg-black/60 active:scale-[0.99]")
          }
        >
          {busy ? "Starting…" : "Pay invoice"}
        </button>
      </div>

      {inlineError ? (
        <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
          {inlineError}
        </div>
      ) : null}
    </div>
  );
}