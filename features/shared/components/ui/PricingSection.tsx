"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { PLAN_PRICING, type PlanKey } from "@/features/stripe/lib/stripe/constants";

export type BillingInterval = "monthly" | "yearly";

export type CheckoutPayload = {
  planKey: PlanKey;
  interval: BillingInterval;
};

export type PricingSectionProps = {
  onCheckout: (payload: CheckoutPayload) => void | Promise<void>;
  onStartFree: () => void;
};

const sharedFeatures = [
  "Work orders, inspections, quotes, and invoicing",
  "Customer and fleet portals",
  "Parts, purchasing, and receiving workflows",
  "Workforce scheduling, attendance, and readiness",
  "AI assistance and guided Shop Boost onboarding",
];

const plans: Array<{
  key: PlanKey;
  name: string;
  price: string;
  users: string;
  description: string;
  featured?: boolean;
}> = [
  {
    key: "starter",
    name: "Complete 10",
    price: `$${PLAN_PRICING.starter}`,
    users: "Up to 10 active users",
    description: "A complete operating system for independent and smaller repair teams.",
  },
  {
    key: "pro",
    name: "Complete 50",
    price: `$${PLAN_PRICING.pro}`,
    users: "Up to 50 active users",
    description: "Full platform access for growing shops with larger operational teams.",
    featured: true,
  },
  {
    key: "unlimited",
    name: "Complete Unlimited",
    price: `$${PLAN_PRICING.unlimited}`,
    users: "Unlimited active users",
    description: "Unlimited users per location for high-volume and multi-team operations.",
  },
];

export default function PricingSection({ onCheckout }: PricingSectionProps) {
  const [busyKey, setBusyKey] = useState<PlanKey | null>(null);

  const startCheckout = async (planKey: PlanKey) => {
    if (busyKey) return;
    setBusyKey(planKey);
    try {
      await onCheckout({ planKey, interval: "monthly" });
    } catch (error) {
      console.error("[PricingSection] checkout failed", error);
      window.alert("Checkout could not be started. Please try again.");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div>
      <div className="grid gap-5 lg:grid-cols-3">
        {plans.map((plan) => {
          const isBusy = busyKey === plan.key;
          return (
            <article
              key={plan.key}
              className={`relative flex flex-col rounded-[1.5rem] border bg-white p-7 transition sm:p-8 ${
                plan.featured
                  ? "border-[color:var(--marketing-copper)] shadow-[0_22px_55px_rgba(143,69,40,0.13)]"
                  : "border-[color:var(--marketing-border)] shadow-sm"
              }`}
            >
              {plan.featured ? (
                <div className="absolute right-6 top-0 -translate-y-1/2 rounded-full bg-[color:var(--marketing-copper)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-white">
                  Most popular
                </div>
              ) : null}

              <div className="text-sm font-bold text-[color:var(--marketing-copper-dark)]">{plan.name}</div>
              <div className="mt-5 flex items-end gap-2">
                <span className="text-5xl font-semibold tracking-[-0.05em] text-[color:var(--marketing-ink)]">{plan.price}</span>
                <span className="pb-1.5 text-sm text-[color:var(--marketing-muted)]">/ month / location</span>
              </div>
              <div className="mt-3 text-sm font-bold text-[color:var(--marketing-ink)]">{plan.users}</div>
              <p className="mt-3 min-h-[48px] text-sm leading-6 text-[color:var(--marketing-muted)]">{plan.description}</p>

              <button
                type="button"
                onClick={() => void startCheckout(plan.key)}
                disabled={Boolean(busyKey)}
                className={`mt-7 rounded-xl px-4 py-3 text-sm font-bold transition disabled:cursor-wait disabled:opacity-60 ${
                  plan.featured
                    ? "bg-[color:var(--marketing-copper)] text-white hover:bg-[color:var(--marketing-copper-dark)]"
                    : "border border-[color:var(--marketing-border-strong)] bg-[color:var(--marketing-stone)] text-[color:var(--marketing-ink)] hover:border-[color:var(--marketing-steel)]"
                }`}
              >
                {isBusy ? "Starting…" : "Start 14-day free trial"}
              </button>

              <div className="my-7 h-px bg-[color:var(--marketing-border)]" />
              <div className="text-xs font-bold uppercase tracking-[0.15em] text-[color:var(--marketing-muted)]">Everything included</div>
              <ul className="mt-4 space-y-3">
                {sharedFeatures.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm leading-6 text-[color:var(--marketing-ink)]">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[color:var(--marketing-copper-soft)] text-[color:var(--marketing-copper-dark)]">
                      <Check size={12} />
                    </span>
                    {feature}
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>

      <div className="mt-6 flex flex-col gap-2 rounded-2xl border border-[color:var(--marketing-border)] bg-[color:var(--marketing-stone)] px-5 py-4 text-xs leading-5 text-[color:var(--marketing-muted)] sm:flex-row sm:items-center sm:justify-between">
        <span>All plans include the complete core platform. Cancel anytime.</span>
        <span>Payment processing, SMS, storage overages, and unusually heavy AI usage may be billed separately.</span>
      </div>
    </div>
  );
}
