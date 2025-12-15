"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@shared/components/ui/Button";
import { Input } from "@shared/components/ui/input";

type Props = {
  shopId: string;
  stripeAccountId: string;
  currency?: "usd" | "cad";
  workOrderId?: string | null;
  workOrderLineId?: string | null;
  customerId?: string | null;
  defaultAmountCents?: number; // optional
};

function dollarsToCents(v: string): number {
  const n = Number(String(v ?? "").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function formatCurrencyLabel(currency: "usd" | "cad"): string {
  return currency === "cad" ? "CAD" : "USD";
}

export default function CustomerPaymentButton(props: Props) {
  const currency = props.currency ?? "usd";

  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState<string>(() => {
    const cents = props.defaultAmountCents ?? 0;
    return cents > 0 ? (cents / 100).toFixed(2) : "";
  });
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);

  const amountCents = useMemo(() => dollarsToCents(amount), [amount]);

  async function startCheckout(): Promise<void> {
    if (busy) return;

    if (!amountCents || amountCents < 50) {
      toast.error("Enter a valid amount (min $0.50).");
      return;
    }

    setBusy(true);
    try {
      // ✅ This is inside the app, so use the staff-gated route.
      const res = await fetch("/api/stripe/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shopId: props.shopId,
          amountCents,
          currency,
          description: desc || "Repair order payment",
          workOrderId: props.workOrderId ?? null,
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
    <div className="rounded-xl border border-[var(--metal-border-soft)] bg-black/35 p-3 backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-200">
          Take payment
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Close" : "New payment"}
        </Button>
      </div>

      {open && (
        <div className="mt-3 space-y-2">
          <div className="grid gap-2 md:grid-cols-2">
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={`Amount (${formatCurrencyLabel(currency)})`}
              inputMode="decimal"
            />
            <Input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Description (optional)"
            />
          </div>

          <Button onClick={startCheckout} disabled={busy}>
            {busy ? "Starting…" : "Pay with card"}
          </Button>

          <div className="text-[11px] text-neutral-400">
            Customer pays {formatCurrencyLabel(currency)} • Funds go to the shop •
            Platform fee (3%) applied automatically.
          </div>
        </div>
      )}
    </div>
  );
}