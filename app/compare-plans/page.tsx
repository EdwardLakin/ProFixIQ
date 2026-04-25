//app/compare-plans/page.tsx

"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Toaster, toast } from "sonner";
import {
  parseActivationContextFromSearchParams,
  persistActivationContext,
} from "@/features/integrations/shopBoost/activationContext";
import PricingSection from "@/features/shared/components/ui/PricingSection";

type Interval = "monthly" | "yearly";

export default function ComparePlansPage() {
  const searchParams = useSearchParams();
  const demoId = searchParams.get("demoId");
  const intakeId = searchParams.get("intakeId");
  const activationContext = parseActivationContextFromSearchParams(searchParams);
  useEffect(() => {
    if (!activationContext) return;
    persistActivationContext(activationContext);
  }, [activationContext]);

  const handleCheckout = async ({
    planKey,
    interval,
  }: {
    planKey: string;
    interval: Interval;
  }) => {
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "pricing_cta",
          planKey,
          interval,
          cancelPath: "/compare-plans",
          demoId: demoId ?? null,
          intakeId: intakeId ?? null,
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
                Resume activation context is saved. Reference: <span className="text-neutral-300">{demoId}</span>
                {intakeId ? <span className="text-neutral-400"> • Intake: {intakeId}</span> : null}
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

        <div className="rounded-3xl border border-white/10 bg-black/35 p-4 backdrop-blur-xl md:p-6">
          {demoId ? (
            <div className="mb-4 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-xs text-cyan-100">
              Your shop preview is ready to resume. Nothing has been written yet, and activation will carry this analysis into guided import onboarding.
            </div>
          ) : null}
          <PricingSection
            onCheckout={handleCheckout}
            onStartFree={() => {
              toast.message("Choose a plan to continue", {
                description: "We don’t create accounts without an active plan.",
              });
            }}
          />
        </div>

        <div className="mt-8 rounded-3xl border border-white/10 bg-black/25 p-5 backdrop-blur-xl">
          <div className="text-sm font-semibold text-neutral-100">
            What happens after checkout?
          </div>
          <p className="mt-1 text-sm text-neutral-400">
            After payment, we&apos;ll continue activation and start your real import based on this preview context.
          </p>
          <p className="mt-2 text-[11px] text-neutral-500">
            Cancel anytime. Taxes billed per your Stripe setup.
          </p>
        </div>
      </div>
    </div>
  );
}
