"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@shared/components/ui/Button";

type Props = {
  shopId: string;
  stripeAccountId: string;
  currency?: "usd" | "cad";
  workOrderId?: string | null;
  workOrderLineId?: string | null;
  customerId?: string | null;
  defaultAmountCents?: number;
};

export default function CustomerPaymentButton(props: Props) {
  const [busy, setBusy] = useState(false);

  async function startCheckout(): Promise<void> {
    if (busy) return;
    if (!props.workOrderId) {
      toast.error("A work order is required to take payment.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/stripe/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workOrderId: props.workOrderId }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
      if (!response.ok || !payload.url) {
        toast.error(payload.error || "Failed to start checkout.");
        return;
      }
      window.location.href = payload.url;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-[var(--metal-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--theme-text-primary)]">
            Take payment
          </div>
          <div className="mt-1 text-[11px] text-[color:var(--theme-text-secondary)]">
            The server charges the current outstanding finalized invoice balance.
          </div>
        </div>
        <Button size="sm" variant="secondary" onClick={startCheckout} disabled={busy || !props.workOrderId}>
          {busy ? "Starting…" : "Pay with card"}
        </Button>
      </div>
    </div>
  );
}
