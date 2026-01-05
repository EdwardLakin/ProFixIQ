//app/compare-plans/page.tsx

"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Toaster, toast } from "sonner";

import PricingSection from "@/features/shared/components/ui/PricingSection";

type Interval = "monthly" | "yearly";

export default function ComparePlansPage() {
  const searchParams = useSearchParams();
  const demoId = searchParams.get("demoId");

  const handleCheckout = async ({
    priceId,
    interval,
  }: {
    priceId: string;
    interval: Interval;
  }) => {
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // IMPORTANT: this matches your landing page contract
          planKey: priceId,
          shopId: demoId ? `demo:${demoId}` : "public_compare_plans",
          userId: null,
          interval,
          // Optional attribution (safe if API ignores it)
          demoId: demoId ?? null,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(data?.details || data?.error || "Checkout failed");
        return;
      }

      if (data?.url) {
        window.location.href = data.url;
        return;
      }

      toast.error("No checkout URL returned");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unexpected error starting checkout.";
      toast.error(message);
    }
  };

  return (
    <div
      className="
        relative min-h-screen text-white
        bg-background
        bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.14),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.96),#020617_78%)]
      "
    >
      <Toaster position="top-center" />

      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
        {/* Header */}
        <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-neutral-500">
              ProFixIQ • Pricing
            </p>
            <h1
              className="mt-2 text-3xl text-neutral-100 sm:text-4xl"
              style={{ fontFamily: "var(--font-blackops)" }}
            >
              Choose your plan
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-neutral-400">
              Accounts are created after checkout — we don&apos;t allow sign-up without a
              plan.
            </p>

            {demoId ? (
              <p className="mt-2 text-[11px] text-neutral-500">
                Demo reference: <span className="text-neutral-300">{demoId}</span>
              </p>
            ) : null}
          </div>

          <Link
            href="/"
            className="inline-flex items-center rounded-xl border border-white/10 bg-black/25 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-neutral-200 transition hover:bg-neutral-900/40"
          >
            ← Back
          </Link>
        </div>

        {/* Pricing cards (same component as landing) */}
        <div className="rounded-3xl border border-white/10 bg-black/35 p-4 backdrop-blur-xl md:p-6">
          <PricingSection
            onCheckout={handleCheckout}
            onStartFree={() => {
              toast.message("Choose a plan to continue", {
                description: "We don’t create accounts without an active plan.",
              });
            }}
          />
        </div>

        {/* Footer note */}
        <div className="mt-8 rounded-3xl border border-white/10 bg-black/25 p-5 backdrop-blur-xl">
          <div className="text-sm font-semibold text-neutral-100">
            What happens after checkout?
          </div>
          <p className="mt-1 text-sm text-neutral-400">
            After payment, we&apos;ll continue onboarding and create your shop + account
            attached to the plan you picked.
          </p>
          <p className="mt-2 text-[11px] text-neutral-500">
            Cancel anytime. Taxes billed per your Stripe setup.
          </p>
        </div>
      </div>
    </div>
  );
}