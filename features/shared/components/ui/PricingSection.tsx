"use client";

import { Check } from "lucide-react";
import {
  PRICE_IDS,
  type PlanKey,
} from "@/features/stripe/lib/stripe/constants";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type CheckoutPayload = {
  priceId: string;
  interval: "monthly" | "yearly";
};

type PricingSectionProps = {
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
  featured: boolean; // ✅ make it non-optional to avoid union inference issues
};

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

export default function PricingSection({
  onCheckout,
  onStartFree,
}: PricingSectionProps) {
  // Monthly only for now (future-safe payload)
  const interval: CheckoutPayload["interval"] = "monthly";

  const pickPriceId = (key: PlanKey) => PRICE_IDS[key].monthly;

  // ✅ Force the array type + ensure featured exists on ALL items
  const plans: PricingPlan[] = [
    {
      key: "pro30",
      title: "Shop (Up to 30 users)",
      desc: "Full access. Built for most repair shops.",
      priceLabel: "$300 / month",
      features: [
        "Unlimited access to all ProFixIQ features",
        "Up to 30 users (techs, advisors, parts, admin)",
        "AI planner, inspections, portal & messaging",
        "Priority support",
      ],
      featured: true,
      cta: "Start",
    },
    {
      key: "unlimited",
      title: "Shop (Unlimited users)",
      desc: "Full access at scale — no seat math.",
      priceLabel: "$500 / month",
      features: [
        "Unlimited access to all ProFixIQ features",
        "Unlimited users",
        "Best for multi-shift or multi-location shops",
        "Priority support",
      ],
      featured: false,
      cta: "Start",
    },
  ];

  return (
    <div className="w-full">
      {/* Intro */}
      <div className="mx-auto mb-8 max-w-3xl text-center">
        <p className="text-sm text-neutral-300">
          No feature gating. Full access from day one.
        </p>
        <p className="mt-2 text-xs text-neutral-500">
          Trial & onboarding available — pricing finalizes at checkout.
        </p>

        <button
          onClick={onStartFree}
          className="mt-4 rounded-xl border border-white/10 bg-black/25 px-4 py-2 text-sm font-semibold text-neutral-200 transition hover:bg-neutral-900/40"
        >
          Start trial / onboarding
        </button>
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
                : "border-[var(--metal-border-soft)]",
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
                    style={{ color: "var(--accent-copper)" }}
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
              style={{ backgroundColor: "var(--accent-copper)" }}
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
}