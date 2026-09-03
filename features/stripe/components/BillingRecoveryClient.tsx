"use client";

import { CreditCard } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import OwnerPinModal from "@/features/shared/components/OwnerPinModal";
import { Button, buttonClasses } from "@/features/shared/components/ui/Button";

export default function BillingRecoveryClient({ shopId }: { shopId: string }) {
  const [openingPortal, setOpeningPortal] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPortal() {
    setOpeningPortal(true);
    setError(null);
    try {
      const response = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnTo: "/account/billing" }),
        credentials: "include",
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        url?: string;
      } | null;
      if (!response.ok || !body?.url) {
        throw new Error(body?.error || "The billing portal is unavailable.");
      }
      window.location.assign(body.url);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The billing portal is unavailable.",
      );
      setOpeningPortal(false);
    }
  }

  return (
    <main className="min-h-screen bg-[color:var(--theme-surface-page)] px-4 py-10 text-[color:var(--theme-text-primary)]">
      <section className="mx-auto max-w-xl rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-raised)] p-6 shadow-lg">
        <div className="inline-grid h-11 w-11 place-items-center rounded-xl bg-[color:color-mix(in_srgb,var(--accent-copper)_15%,transparent)] text-[var(--accent-copper)]">
          <CreditCard className="h-5 w-5" aria-hidden />
        </div>
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-copper)]">
          Account recovery
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Billing and subscription
        </h1>
        <p className="mt-3 text-sm leading-6 text-[color:var(--theme-text-secondary)]">
          This limited page lets an authorized owner restore or manage product
          access without opening Shop operations.
        </p>

        {error ? (
          <p className="mt-5 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-200">
            {error}
          </p>
        ) : null}

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Button
            type="button"
            onClick={() => setPinOpen(true)}
            disabled={openingPortal}
          >
            {openingPortal ? "Opening…" : "Manage in Stripe"}
          </Button>
          <Link
            href="/compare-plans"
            className={buttonClasses({ variant: "outline" })}
          >
            Review product plans
          </Link>
        </div>
      </section>

      <OwnerPinModal
        shopId={shopId}
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        onVerified={() => void openPortal()}
      />
    </main>
  );
}
