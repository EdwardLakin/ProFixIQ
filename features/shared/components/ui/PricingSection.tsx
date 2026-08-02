"use client";

import { useRef, useState } from "react";
import { Check } from "lucide-react";
import {
  PLAN_PRICING,
  type PlanKey,
} from "@/features/stripe/lib/stripe/constants";
import {
  ADDITIONAL_USER_MONTHLY_PRICE,
  INCLUDED_USERS,
} from "@/features/stripe/lib/stripe/billing-model";
import styles from "./PricingSection.module.css";

export type BillingInterval = "monthly" | "yearly";

export type CheckoutPayload = {
  planKey: PlanKey;
  interval: BillingInterval;
  checkoutAttemptId: string;
};

export type PricingSectionProps = {
  onCheckout: (payload: CheckoutPayload) => void | Promise<void>;
  onStartFree: () => void;
  surface: "light" | "dark";
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
    name: "ProFixIQ Complete",
    price: `$${PLAN_PRICING.starter}`,
    users: `${INCLUDED_USERS} users included, then $${ADDITIONAL_USER_MONTHLY_PRICE} per additional user`,
    description:
      "The complete ProFixIQ platform for repair shops of any size. Billing grows with your active team and never removes features.",
    featured: true,
  },
  {
    key: "unlimited",
    name: "ProFixIQ Unlimited",
    price: `$${PLAN_PRICING.unlimited}`,
    users: "Unlimited active users",
    description:
      "A predictable flat monthly price for shops with 17 or more active users.",
  },
];

export default function PricingSection({
  onCheckout,
  surface,
}: PricingSectionProps) {
  const [busyKey, setBusyKey] = useState<PlanKey | null>(null);
  const attemptIds = useRef<Partial<Record<PlanKey, string>>>({});

  const startCheckout = async (planKey: PlanKey) => {
    if (busyKey) return;
    setBusyKey(planKey);
    try {
      const checkoutAttemptId =
        attemptIds.current[planKey] ??
        (attemptIds.current[planKey] = crypto.randomUUID());
      await onCheckout({ planKey, interval: "monthly", checkoutAttemptId });
    } catch (error) {
      console.error("[PricingSection] checkout failed", error);
      window.alert("Checkout could not be started. Please try again.");
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <section
      aria-label="Pricing plans"
      className={styles.root}
      data-surface={surface}
    >
      <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-2">
        {plans.map((plan) => {
          const isBusy = busyKey === plan.key;
          return (
            <article
              key={plan.key}
              className={`${styles.card} ${
                plan.featured ? styles.featuredCard : ""
              } relative flex flex-col rounded-[1.5rem] border p-7 transition sm:p-8`}
            >
              {plan.featured ? (
                <div
                  className={`${styles.badge} absolute right-6 top-0 -translate-y-1/2 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em]`}
                >
                  Best for most shops
                </div>
              ) : null}

              <div className={`${styles.accentText} text-sm font-bold`}>
                {plan.name}
              </div>
              <div className="mt-5 flex items-end gap-2">
                <span
                  className={`${styles.primaryText} text-5xl font-semibold tracking-[-0.05em]`}
                >
                  {plan.price}
                </span>
                <span className={`${styles.mutedText} pb-1.5 text-sm`}>
                  / month / location
                </span>
              </div>
              <div className={`${styles.primaryText} mt-3 text-sm font-bold`}>
                {plan.users}
              </div>
              <p
                className={`${styles.mutedText} mt-3 min-h-[48px] text-sm leading-6`}
              >
                {plan.description}
              </p>

              <button
                type="button"
                onClick={() => void startCheckout(plan.key)}
                disabled={Boolean(busyKey)}
                aria-busy={isBusy}
                className={`${styles.button} ${
                  plan.featured ? styles.primaryButton : styles.secondaryButton
                } mt-7 rounded-xl border px-4 py-3 text-sm font-bold transition`}
              >
                {isBusy ? "Starting…" : "Start 14-day free trial"}
              </button>

              <div className={`${styles.divider} my-7 h-px`} />
              <div
                className={`${styles.mutedText} text-xs font-bold uppercase tracking-[0.15em]`}
              >
                Everything included
              </div>
              <ul className="mt-4 space-y-3">
                {sharedFeatures.map((feature) => (
                  <li
                    key={feature}
                    className={`${styles.primaryText} flex items-start gap-3 text-sm leading-6`}
                  >
                    <span
                      className={`${styles.featureIcon} mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full`}
                    >
                      <Check aria-hidden="true" size={12} />
                    </span>
                    {feature}
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>

      <div
        className={`${styles.notice} mx-auto mt-6 flex max-w-5xl flex-col gap-2 rounded-2xl border px-5 py-4 text-xs leading-5 sm:flex-row sm:items-center sm:justify-between`}
      >
        <span>
          Both options include the complete platform. No feature gating. Cancel anytime.
        </span>
        <span>
          Complete automatically caps at Unlimited pricing when the shop reaches 17 active users.
        </span>
      </div>
    </section>
  );
}
