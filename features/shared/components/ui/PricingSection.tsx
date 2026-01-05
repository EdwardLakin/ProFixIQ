"use client";

import type { FC } from "react";
import { Check } from "lucide-react";
import {
  PRICE_IDS,
  type PlanKey,
} from "@/features/stripe/lib/stripe/constants";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type BillingInterval = "monthly" | "yearly";

export type CheckoutPayload = {
  priceId: string;
  interval: BillingInterval;
};

export type PricingSectionProps = {
  onCheckout: (payload: CheckoutPayload) => void | Promise<void>;
  onStartFree: () => void;
};

type PricingPlan = {
  key: PlanKey;
  title: string;
  desc: string;
  priceLabel: string;
  features: string[];
  cta: string;
  featured: boolean;
};

/* -------------------------------------------------------------------------- */
/* Data                                                                       */
/* -------------------------------------------------------------------------- */

const COPPER = "var(--pfq-copper)";

const plans: PricingPlan[] = [
  {
    key: "pro30",
    title: "Shop HD (up to 50 users)",
    desc: "For most heavy-duty or mixed shops that need HD inspections, portal, and AI in one place.",
    priceLabel: "$399 / month",
    features: [
      "All ProFixIQ HD & fleet features included",
      "Up to 50 users (techs, advisors, parts, admin)",
      "HD inspections, portal, messaging & AI planner",
      "Priority support",
    ],
    featured: true,
    cta: "Start shop plan",
  },
  {
    key: "unlimited",
    title: "Fleet / Multi-location",
    desc: "Unlimited users per location — ideal for larger fleets, municipalities, and multi-site operations.",
    priceLabel: "$599 / month / location",
    features: [
      "Unlimited users per location",
      "All HD inspections, portal, and dispatch tools",
      "Best for fleets, municipalities, and larger operations",
      "Priority support",
    ],
    featured: false,
    cta: "Start fleet plan",
  },
];

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

const PricingSection: FC<PricingSectionProps> = ({
  onCheckout,
}) => {
  const interval: BillingInterval = "monthly";

  const pickPriceId = (key: PlanKey) => PRICE_IDS[key].monthly;

  return (
    <div className="w-full">
      {/* Intro */}
      <div className="mx-auto mb-8 max-w-3xl text-center">
        <p className="text-sm text-neutral-300">
          No feature gating. HD inspections, fleet programs, portal and AI
          are included from day one.
        </p>
        <p className="mt-2 text-xs text-neutral-500">
          Onboarding available — pricing finalizes at checkout.
        </p>

        
      </div>

      {/* Plans */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {plans.map((p) => (
          <div
            key={p.key}
            className={[
              "rounded-3xl border bg-black/30 p-6 backdrop-blur-xl transition",
              p.featured
                ? "border-[color:var(--accent-copper)]/45 shadow-[0_0_40px_rgba(212,118,49,0.18)]"
                : "border-[color:var(--metal-border-soft)]",
            ].join(" ")}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3
                  className="text-xl text-white"
                  style={{ fontFamily: "var(--font-blackops)" }}
                >
                  {p.title}
                </h3>
                <p className="mt-1 text-sm text-neutral-400">{p.desc}</p>
              </div>

              {p.featured ? (
                <span
                  className="rounded-full border px-3 py-1 text-xs font-semibold"
                  style={{
                    borderColor: "rgba(255,255,255,0.12)",
                    backgroundColor: "rgba(193,102,59,0.16)",
                    color: "var(--accent-copper-light)",
                  }}
                >
                  Most popular
                </span>
              ) : null}
            </div>

            {/* Price */}
            <div className="mt-5 flex items-baseline gap-2">
              <div
                className="text-3xl font-bold"
                style={{ color: "var(--accent-copper-light)" }}
              >
                {p.priceLabel}
              </div>
            </div>

            {/* Features */}
            <ul className="mt-5 space-y-2 text-sm text-neutral-200">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check
                    size={16}
                    className="mt-0.5"
                    style={{ color: COPPER }}
                  />
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            {/* CTA */}
            <button
              onClick={() =>
                onCheckout({
                  priceId: pickPriceId(p.key),
                  interval,
                })
              }
              className="mt-6 w-full rounded-xl px-4 py-3 text-sm font-bold text-black transition hover:opacity-95"
              style={{ backgroundColor: COPPER }}
            >
              {p.cta}
            </button>

            <p className="mt-3 text-xs text-neutral-500">
              Taxes billed per your Stripe setup. Cancel anytime.
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PricingSection;