// features/shared/components/ui/PricingSection.tsx

"use client";

import type { FC } from "react";
import { useState } from "react";
import { Check } from "lucide-react";
import { PRICE_IDS, type PlanKey } from "@/features/stripe/lib/stripe/constants";

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
    key: "starter10",
    title: "Starter (up to 10 users)",
    desc: "Perfect for smaller teams getting started — technician-first inspections, quotes, approvals, and customer transparency.",
    priceLabel: "$299 / month",
    features: [
      "14-day free trial included",
      "Up to 10 users (techs, advisors, parts, admin)",
      "HD + fleet-ready inspections (works great for automotive too)",
      "Customer portal + proof-based approvals",
      "Internal messaging + role-based dashboards",
    ],
    featured: false,
    cta: "Start free trial",
  },
  {
    key: "pro50",
    title: "Pro (up to 50 users)",
    desc: "Best for most HD or mixed shops — everything you need to run the shop with less screen time and faster approvals.",
    priceLabel: "$399 / month",
    features: [
      "14-day free trial included",
      "Up to 50 users (techs, advisors, parts, admin)",
      "Measured diagnostic inspections + automation workflows",
      "Customer portal + fleet programs",
      "Priority support",
    ],
    featured: true,
    cta: "Start free trial",
  },
  {
    key: "unlimited",
    title: "Unlimited (per location)",
    desc: "Unlimited users per location — ideal for larger HD operations, fleets, municipalities, and multi-role teams.",
    priceLabel: "$599 / month / location",
    features: [
      "14-day free trial included",
      "Unlimited users per location",
      "Best for fleets + high-volume operations",
      "All inspections, portal, messaging, and automation",
      "Priority support",
    ],
    featured: false,
    cta: "Start free trial",
  },
];

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

const PricingSection: FC<PricingSectionProps> = ({ onCheckout, onStartFree }) => {
  const interval: BillingInterval = "monthly";
  const [busyKey, setBusyKey] = useState<PlanKey | null>(null);

  const pickPriceId = (key: PlanKey) => PRICE_IDS[key].monthly;

  async function handlePlanClick(key: PlanKey) {
    if (busyKey) return;
    setBusyKey(key);

    try {
      await onCheckout({
        priceId: pickPriceId(key),
        interval,
      });
    } catch (err) {
      // Make failures visible during testing instead of “nothing happens”
      console.error("[PricingSection] checkout failed", err);
      alert("Checkout failed. Check console/network for details.");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="w-full">
      {/* Intro */}
      <div className="mx-auto mb-8 max-w-3xl text-center">
        <div className="inline-flex flex-col items-center gap-2">
          <span
            className="rounded-full border px-3 py-1 text-xs font-semibold"
            style={{
              borderColor: "rgba(255,255,255,0.12)",
              backgroundColor: "rgba(193,102,59,0.16)",
              color: "var(--accent-copper-light)",
            }}
          >
            14-day free trial • Founding Shop offer (6 months discounted)
          </span>

          <p className="text-sm text-neutral-300">
            No feature gating. Inspections, portals, messaging, and automation are
            included from day one.
          </p>

          <p className="text-xs text-neutral-500">
            Start your free trial today — your Founding Shop discount applies at
            checkout.
          </p>

          <button
            type="button"
            onClick={onStartFree}
            className={[
              "mt-2 rounded-xl px-4 py-2 text-sm font-bold text-black transition hover:opacity-95",
              "disabled:opacity-60 disabled:cursor-not-allowed",
            ].join(" ")}
            style={{ backgroundColor: COPPER }}
          >
            Start 14-day free trial
          </button>
        </div>
      </div>

      {/* Plans */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {plans.map((p) => {
          const isBusy = busyKey === p.key;

          return (
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
                    <Check size={16} className="mt-0.5" style={{ color: COPPER }} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <button
                type="button"
                onClick={() => void handlePlanClick(p.key)}
                disabled={Boolean(busyKey)}
                className={[
                  "mt-6 w-full rounded-xl px-4 py-3 text-sm font-bold text-black transition hover:opacity-95",
                  "disabled:opacity-60 disabled:cursor-not-allowed",
                ].join(" ")}
                style={{ backgroundColor: COPPER }}
              >
                {isBusy ? "Starting…" : p.cta}
              </button>

              <p className="mt-3 text-xs text-neutral-500">
                14-day free trial. Founding discount applies at checkout. Cancel
                anytime.
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PricingSection;