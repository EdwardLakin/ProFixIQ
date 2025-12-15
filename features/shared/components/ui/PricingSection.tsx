"use client";

import { useMemo, useState } from "react";
import { Check } from "lucide-react";

export type CheckoutPayload = {
  priceId: string; // Stripe price_...
  interval: "monthly" | "yearly";
};

type PricingSectionProps = {
  onCheckout: (payload: CheckoutPayload) => void | Promise<void>;
  onStartFree: () => void; // trial/onboarding
};

/**
 * Matches your current app plan model:
 * - pro30 (30 users)
 * - unlimited
 */
type PlanKey = "pro30" | "unlimited";

/**
 * Centralize mapping here.
 * Replace values with your real Stripe Price IDs.
 */
const PRICE_BY_PLAN: Record<PlanKey, { monthly: string; yearly?: string }> = {
  pro30: {
    monthly: "price_PRO30_MONTHLY",
    yearly: "price_PRO30_YEARLY",
  },
  unlimited: {
    monthly: "price_UNLIMITED_MONTHLY",
    yearly: "price_UNLIMITED_YEARLY",
  },
};

export default function PricingSection({
  onCheckout,
  onStartFree,
}: PricingSectionProps) {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">(
    "monthly",
  );

  const plans = useMemo(
    () =>
      [
        {
          key: "pro30" as const,
          title: "Shop (Up to 30 users)",
          priceMonthly: "$300 / month",
          priceYearly: "$3,000 / year",
          desc: "Full access. Built for most repair shops.",
          features: [
            "Unlimited access to all features",
            "Up to 30 users (techs, advisors, parts, admin)",
            "AI planner, inspections, messaging, portal-ready",
            "Priority support",
          ],
          featured: true,
          cta: "Start",
        },
        {
          key: "unlimited" as const,
          title: "Shop (Unlimited users)",
          priceMonthly: "$500 / month",
          priceYearly: "$5,000 / year",
          desc: "Full access at scale — no seat math.",
          features: [
            "Unlimited access to all features",
            "Unlimited users",
            "Best for multi-shift / multi-location ops",
            "Priority support",
          ],
          cta: "Start",
        },
      ] as const,
    [],
  );

  function pickPriceId(key: PlanKey, interval: "monthly" | "yearly"): string {
    const row = PRICE_BY_PLAN[key];
    if (!row) throw new Error(`Missing plan mapping for: ${key}`);
    if (interval === "yearly") {
      if (!row.yearly) throw new Error(`Yearly price missing for: ${key}`);
      return row.yearly;
    }
    return row.monthly;
  }

  async function handlePick(key: PlanKey) {
    const priceId = pickPriceId(key, billingCycle);
    await onCheckout({ priceId, interval: billingCycle });
  }

  return (
    <div className="w-full">
      <div className="mx-auto mb-8 max-w-3xl text-center">
        <div className="mb-2 font-blackops text-[0.75rem] tracking-[0.26em] text-neutral-300">
          PROFIXIQ PLANS
        </div>

        <p className="text-sm text-neutral-300">
          No feature gating. Full access from day one.
        </p>

        <p className="mt-2 text-xs text-neutral-500">
          You can start onboarding now — choose a plan when ready.
        </p>

        {/* Billing toggle (keep or remove) */}
        <div className="mt-5 inline-flex overflow-hidden rounded-full border border-[var(--metal-border-soft)] bg-black/35">
          <button
            type="button"
            onClick={() => setBillingCycle("monthly")}
            className={[
              "px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition",
              billingCycle === "monthly"
                ? "bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] text-black"
                : "text-neutral-300 hover:bg-white/5",
            ].join(" ")}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setBillingCycle("yearly")}
            className={[
              "px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition",
              billingCycle === "yearly"
                ? "bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] text-black"
                : "text-neutral-300 hover:bg-white/5",
            ].join(" ")}
          >
            Yearly
          </button>
        </div>

        <button
          onClick={onStartFree}
          className="mt-5 inline-flex rounded-full border border-[var(--metal-border-soft)] bg-black/35 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-neutral-200 hover:bg-white/5"
        >
          Start onboarding
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {plans.map((p) => {
          const priceLabel =
            billingCycle === "yearly" ? p.priceYearly : p.priceMonthly;

          return (
            <div
              key={p.key}
              className={[
                "rounded-3xl border p-6 backdrop-blur-xl",
                "bg-[linear-gradient(180deg,rgba(255,255,255,0.06),rgba(0,0,0,0.35))]",
                p.featured
                  ? "border-[color:var(--accent-copper)]/45 shadow-[0_0_40px_rgba(212,118,49,0.18)]"
                  : "border-[var(--metal-border-soft)]",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl text-white font-blackops tracking-[0.08em]">
                    {p.title}
                  </h3>
                  <p className="mt-1 text-sm text-neutral-400">{p.desc}</p>
                </div>

                {p.featured ? (
                  <span className="rounded-full border border-white/10 bg-black/35 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--accent-copper-light)]">
                    Most popular
                  </span>
                ) : null}
              </div>

              <div className="mt-5 flex items-baseline gap-2">
                <div className="text-3xl font-bold text-[var(--accent-copper-light)]">
                  {priceLabel}
                </div>
              </div>

              <ul className="mt-5 space-y-2 text-sm text-neutral-200">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check
                      size={16}
                      className="mt-0.5 text-[var(--accent-copper)]"
                    />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <button
                onClick={() => void handlePick(p.key)}
                className="mt-6 w-full rounded-xl px-4 py-3 text-xs font-semibold uppercase tracking-[0.22em] text-black shadow-[0_0_20px_rgba(212,118,49,0.55)] hover:brightness-110"
                style={{
                  background:
                    "linear-gradient(to right,var(--accent-copper-soft),var(--accent-copper))",
                }}
              >
                {p.cta}
              </button>

              <p className="mt-3 text-xs text-neutral-500">
                Taxes billed per your Stripe setup. Cancel anytime.
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}