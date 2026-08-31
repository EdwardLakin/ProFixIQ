"use client";

import { ArrowLeft, CreditCard, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import OwnerPinModal from "@/features/shared/components/OwnerPinModal";
import { Button, buttonClasses } from "@/features/shared/components/ui/Button";
import { OWNER_PIN_PURPOSES } from "@/features/shared/lib/owner-pin-purpose";

type BillingStatus = {
  status?: string | null;
  cancel_at_period_end?: boolean;
  current_period_end?: string | null;
  trial_end?: string | null;
  linkage_needed?: boolean;
  linkage_state?: string | null;
};

function readableStatus(value: string | null | undefined): string {
  const normalized = String(value ?? "unknown")
    .trim()
    .replaceAll("_", " ");
  return normalized
    ? normalized.charAt(0).toUpperCase() + normalized.slice(1)
    : "Unknown";
}

function readableDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

export default function BillingRecoveryClient({ shopId }: { shopId: string }) {
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/stripe/subscription", {
        cache: "no-store",
        credentials: "include",
      });
      const body = (await response.json().catch(() => null)) as
        | (BillingStatus & { error?: string })
        | null;
      if (!response.ok) {
        throw new Error(body?.error || "Billing status is unavailable.");
      }
      setBilling(body ?? {});
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Billing status is unavailable.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openPortal = useCallback(async () => {
    setOpeningPortal(true);
    setError(null);
    try {
      const response = await fetch("/api/stripe/portal", {
        method: "POST",
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
    } finally {
      setOpeningPortal(false);
    }
  }, []);

  const periodEnd = readableDate(billing?.current_period_end);
  const trialEnd = readableDate(billing?.trial_end);

  return (
    <main className="min-h-screen bg-[color:var(--theme-surface-page)] px-4 py-10 text-[color:var(--theme-text-primary)]">
      <div className="mx-auto max-w-xl space-y-5">
        <header className="space-y-3">
          <Link
            href="/sign-in"
            className="inline-flex items-center gap-2 text-sm text-[color:var(--theme-text-secondary)] hover:text-[color:var(--theme-text-primary)]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Product access
          </Link>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-copper)]">
              Account recovery
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Billing and subscription
            </h1>
            <p className="mt-2 text-sm leading-6 text-[color:var(--theme-text-secondary)]">
              This limited page stays available when an operational product is
              inactive so an authorized owner can restore or manage access.
            </p>
          </div>
        </header>

        <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-raised)] p-5 shadow-lg">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="inline-grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[color:color-mix(in_srgb,var(--accent-copper)_15%,transparent)] text-[var(--accent-copper)]">
                <CreditCard className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <div className="text-xs uppercase tracking-wide text-[color:var(--theme-text-muted)]">
                  Subscription status
                </div>
                <div className="mt-1 text-lg font-semibold">
                  {loading ? "Checking…" : readableStatus(billing?.status)}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading}
              className="inline-grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[color:var(--theme-border-soft)] disabled:opacity-50"
              aria-label="Refresh billing status"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                aria-hidden
              />
            </button>
          </div>

          {!loading && billing ? (
            <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
              {trialEnd ? (
                <div>
                  <dt className="text-[color:var(--theme-text-muted)]">
                    Trial ends
                  </dt>
                  <dd className="mt-1 font-medium">{trialEnd}</dd>
                </div>
              ) : null}
              {periodEnd ? (
                <div>
                  <dt className="text-[color:var(--theme-text-muted)]">
                    {billing.cancel_at_period_end
                      ? "Access scheduled through"
                      : "Current period ends"}
                  </dt>
                  <dd className="mt-1 font-medium">{periodEnd}</dd>
                </div>
              ) : null}
              {billing.linkage_needed ? (
                <div className="sm:col-span-2">
                  <dt className="text-[color:var(--theme-text-muted)]">
                    Billing linkage
                  </dt>
                  <dd className="mt-1 font-medium">
                    {readableStatus(billing.linkage_state)}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : null}

          {error ? (
            <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-200">
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
      </div>

      <OwnerPinModal
        shopId={shopId}
        open={pinOpen}
        onClose={() => setPinOpen(false)}
        onVerified={() => void openPortal()}
        purpose={OWNER_PIN_PURPOSES.BILLING}
      />
    </main>
  );
}
