"use client";

import { useState } from "react";
import { toast, Toaster } from "sonner";

import OwnerPinModal from "@/features/shared/components/OwnerPinModal";
import PricingSection, {
  type CheckoutPayload,
} from "@/features/shared/components/ui/PricingSection";

export default function BillingRecoveryPlansClient({
  shopId,
}: {
  shopId: string;
}) {
  const [pinOpen, setPinOpen] = useState(false);
  const [pendingCheckout, setPendingCheckout] =
    useState<CheckoutPayload | null>(null);

  async function startCheckout(checkout: CheckoutPayload) {
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flow: "owner",
          source: "billing_recovery",
          packageKey: checkout.packageKey,
          interval: checkout.interval,
          checkoutAttemptId: checkout.checkoutAttemptId,
          checkoutMode: "paid",
        }),
      });

      const body = (await response.json().catch(() => null)) as {
        error?: string;
        url?: string | null;
      } | null;

      if (!response.ok || !body?.url) {
        throw new Error(body?.error || "Checkout unavailable");
      }

      window.location.assign(body.url);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Checkout unavailable",
      );
    }
  }

  function handleCheckout(checkout: CheckoutPayload) {
    setPendingCheckout(checkout);
    setPinOpen(true);
  }

  return (
    <>
      <Toaster richColors position="top-center" />

      <PricingSection
        surface="light"
        paidOnly
        onStartFree={() => undefined}
        onCheckout={handleCheckout}
      />

      <OwnerPinModal
        shopId={shopId}
        open={pinOpen}
        purpose="owner_pin:billing"
        onClose={() => {
          setPinOpen(false);
          setPendingCheckout(null);
        }}
        onVerified={() => {
          const checkout = pendingCheckout;
          setPinOpen(false);
          setPendingCheckout(null);
          if (checkout) void startCheckout(checkout);
        }}
      />
    </>
  );
}
