"use client";

import { CreditCard } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { acquisitionHomeHref } from "@/features/auth/lib/acquisitionSurfaceRouting";
import OwnerPinModal from "@/features/shared/components/OwnerPinModal";
import { Button, buttonClasses } from "@/features/shared/components/ui/Button";

type ProtectedAction = "portal" | "recovery";

export default function BillingRecoveryClient({
  shopId,
  recoverySessionId,
}: {
  shopId: string;
  recoverySessionId: string | null;
}) {
  const [openingPortal, setOpeningPortal] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [protectedAction, setProtectedAction] =
    useState<ProtectedAction>("portal");
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

  async function recoverPurchasedSubscription() {
    if (!recoverySessionId) return;

    setRecovering(true);
    setError(null);

    try {
      const response = await fetch("/api/stripe/checkout/recover-user", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: recoverySessionId }),
      });

      const body = (await response.json().catch(() => null)) as {
        error?: string;
        recovered?: boolean;
        surface?: "shop" | "field" | "fleet";
      } | null;

      if (!response.ok || body?.recovered !== true) {
        throw new Error(
          body?.error || "The purchased subscription could not be restored.",
        );
      }

      if (
        body.surface !== "shop" &&
        body.surface !== "field" &&
        body.surface !== "fleet"
      ) {
        throw new Error("The restored product destination is unavailable.");
      }

      window.location.assign(acquisitionHomeHref(body.surface));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The purchased subscription could not be restored.",
      );
      setRecovering(false);
    }
  }

  function requestProtectedAction(action: ProtectedAction) {
    setProtectedAction(action);
    setPinOpen(true);
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

        {recoverySessionId ? (
          <div className="mt-6 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] p-4">
            <p className="text-sm font-semibold">
              Your purchased subscription needs to be restored
            </p>
            <p className="mt-1 text-sm leading-6 text-[color:var(--theme-text-secondary)]">
              ProFixIQ found a completed checkout that could not be linked to
              this existing account. Restore it here instead of purchasing
              another subscription.
            </p>
            <Button
              type="button"
              className="mt-4 w-full"
              onClick={() => requestProtectedAction("recovery")}
              disabled={recovering || openingPortal}
            >
              {recovering ? "Restoring…" : "Restore purchased subscription"}
            </Button>
          </div>
        ) : null}

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Button
            type="button"
            onClick={() => requestProtectedAction("portal")}
            disabled={openingPortal || recovering}
          >
            {openingPortal ? "Opening…" : "Manage in Stripe"}
          </Button>
          {!recoverySessionId ? (
            <Link
              href="/account/billing/plans"
              className={buttonClasses({ variant: "outline" })}
            >
              Review product plans
            </Link>
          ) : null}
        </div>
      </section>

      <OwnerPinModal
        shopId={shopId}
        open={pinOpen}
        purpose="owner_pin:billing"
        onClose={() => setPinOpen(false)}
        onVerified={() => {
          if (protectedAction === "recovery") {
            void recoverPurchasedSubscription();
          } else {
            void openPortal();
          }
        }}
      />
    </main>
  );
}
