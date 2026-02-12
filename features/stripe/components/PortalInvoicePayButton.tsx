// features/stripe/components/PortalInvoicePayButton.tsx
"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@shared/components/ui/Button";

type Props = {
  shopId: string;
  workOrderId: string;
  amountCents: number;
  currency: "usd" | "cad";
  disabled?: boolean;
};

function formatCurrencyLabel(currency: "usd" | "cad"): string {
  return currency === "cad" ? "CAD" : "USD";
}

export default function PortalInvoicePayButton(props: Props) {
  const [busy, setBusy] = useState(false);

  const canPay = useMemo(() => {
    return (
      !props.disabled &&
      typeof props.amountCents === "number" &&
      Number.isFinite(props.amountCents) &&
      props.amountCents >= 50 &&
      props.shopId.trim().length > 0 &&
      props.workOrderId.trim().length > 0
    );
  }, [props.amountCents, props.disabled, props.shopId, props.workOrderId]);

  async function startCheckout(): Promise<void> {
    if (!canPay || busy) return;

    setBusy(true);
    try {
      const res = await fetch("/api/portal/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId: props.shopId,
          workOrderId: props.workOrderId,
          amountCents: props.amountCents,
          currency: props.currency,
        }),
      });

      const j = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };

      if (!res.ok || !j.url) {
        toast.error(j.error || "Failed to start checkout.");
        return;
      }

      window.location.href = j.url;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-4 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-300">
            Payment
          </div>
          <div className="mt-1 text-sm text-neutral-400">
            Pay your invoice with card • {formatCurrencyLabel(props.currency)}
          </div>
        </div>

        <Button onClick={startCheckout} disabled={!canPay || busy}>
          {busy ? "Starting…" : "Pay invoice"}
        </Button>
      </div>

      {!canPay ? (
        <div className="mt-2 text-[11px] text-neutral-500">
          Payment isn’t available for this invoice yet.
        </div>
      ) : (
        <div className="mt-2 text-[11px] text-neutral-500">
          You’ll be redirected to Stripe Checkout.
        </div>
      )}
    </div>
  );
}