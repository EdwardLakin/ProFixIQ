// features/shared/components/ui/PricingSection.tsx

"use client";

import type { FC } from "react";
import { useMemo, useState } from "react";
import { Check, Sparkles, Timer } from "lucide-react";
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
  subLabel: string;
  features: string[];
  cta: string;
  featured: boolean;
  badge?: string;
};

/* -------------------------------------------------------------------------- */
/* Component                                                                  */
/* -------------------------------------------------------------------------- */

const PricingSection: FC<PricingSectionProps> = ({ onCheckout, onStartFree }) => {
  const interval: BillingInterval = "monthly";
  const [busyKey, setBusyKey] = useState<PlanKey | null>(null);

  const COPPER = "var(--pfq-copper)";
  const COPPER_LIGHT = "var(--accent-copper-light)";

  const plans: PricingPlan[] = useMemo(
    () => [
      {
        key: "starter10",
        title: "Starter",
        desc: "Perfect for smaller teams getting started — technician-first inspections, quotes, approvals, and customer transparency.",
        priceLabel: "$299 / month",
        subLabel: "Up to 10 users",
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
        title: "Pro",
        desc: "Best for most HD or mixed shops — everything you need to run the shop with less screen time and faster approvals.",
        priceLabel: "$399 / month",
        subLabel: "Up to 50 users",
        features: [
          "14-day free trial included",
          "Up to 50 users (techs, advisors, parts, admin)",
          "Measured diagnostic inspections + automation workflows",
          "Customer portal + fleet programs",
          "Priority support",
        ],
        featured: true,
        badge: "Most popular",
        cta: "Start free trial",
      },
      {
        key: "unlimited",
        title: "Unlimited",
        desc: "Unlimited users per location — ideal for larger HD operations, fleets, municipalities, and multi-role teams.",
        priceLabel: "$599 / month / location",
        subLabel: "Unlimited users",
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
    ],
    [],
  );

  const pickPriceId = (key: PlanKey) => PRICE_IDS[key].monthly;

  async function handlePlanClick(key: PlanKey): Promise<void> {
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
      {/* Offer Bar */}
      <div className="mx-auto mb-8 max-w-3xl text-center">
        <div className="inline-flex flex-col items-center gap-3">
          <div
            className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]"
            style={{
              borderColor: "rgba(255,255,255,0.14)",
              backgroundColor: "rgba(193,102,59,0.16)",
              color: "var(--accent-copper-light)",
            }}
          >
            <Timer size={14} />
            <span>14-day free trial</span>
            <span className="mx-1 text-neutral-500">•</span>
            <Sparkles size={14} />
            <span>Founding Shop offer (6 months discounted)</span>
          </div>

          <p className="text-sm text-neutral-200/90">
            No feature gating. Inspections, portals, messaging, and automation are included
            from day one.
          </p>

          <p className="text-xs text-neutral-400">
            Start your free trial today — your Founding Shop discount applies at checkout.
          </p>

          <button
            type="button"
            onClick={onStartFree}
            className={[
              "mt-1 inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-extrabold text-black",
              "shadow-[0_0_24px_rgba(212,118,49,0.35)] transition",
              "hover:brightness-110 active:scale-[0.99]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-copper)]/60",
            ].join(" ")}
            style={{
              background: "linear-gradient(to right, var(--accent-copper-soft), var(--accent-copper))",
              border: "1px solid rgba(255,255,255,0.10)",
            }}
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
            <button
              key={p.key}
              type="button"
              onClick={() => void handlePlanClick(p.key)}
              disabled={Boolean(busyKey)}
              className={[
                "group relative text-left",
                "rounded-3xl border bg-black/35 p-6 backdrop-blur-xl transition",
                "shadow-[0_24px_90px_rgba(0,0,0,0.70)]",
                "hover:bg-black/45 hover:-translate-y-[2px]",
                "active:translate-y-0 active:brightness-95",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-copper)]/60",
                "disabled:opacity-70 disabled:cursor-not-allowed disabled:hover:translate-y-0",
                p.featured
                  ? "border-[color:var(--accent-copper)]/55 shadow-[0_0_44px_rgba(212,118,49,0.22)]"
                  : "border-[color:var(--metal-border-soft)]",
              ].join(" ")}
              style={{
                cursor: busyKey ? "not-allowed" : "pointer",
              }}
              aria-busy={isBusy}
            >
              {/* Glow accent */}
              <div
                className={[
                  "pointer-events-none absolute inset-0 rounded-3xl opacity-0 transition",
                  "group-hover:opacity-100",
                ].join(" ")}
                style={{
                  boxShadow: p.featured
                    ? "0 0 0 1px rgba(212,118,49,0.25) inset, 0 0 60px rgba(212,118,49,0.18)"
                    : "0 0 0 1px rgba(255,255,255,0.06) inset",
                }}
              />

              {/* Header */}
              <div className="relative flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3
                      className="text-2xl text-white"
                      style={{ fontFamily: "var(--font-blackops)" }}
                    >
                      {p.title}
                    </h3>

                    {p.badge ? (
                      <span
                        className="rounded-full border px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.16em]"
                        style={{
                          borderColor: "rgba(255,255,255,0.14)",
                          backgroundColor: "rgba(193,102,59,0.16)",
                          color: "var(--accent-copper-light)",
                        }}
                      >
                        {p.badge}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-1 text-xs font-semibold uppercase tracking-[0.22em] text-neutral-400">
                    {p.subLabel}
                  </div>

                  <p className="mt-3 text-sm text-neutral-300">{p.desc}</p>
                </div>
              </div>

              {/* Price */}
              <div className="relative mt-6">
                <div
                  className={[
                    "text-4xl font-extrabold",
                    p.featured ? "" : "",
                  ].join(" ")}
                  style={{ color: COPPER_LIGHT }}
                >
                  {p.priceLabel}
                </div>
                <div className="mt-2 text-xs text-neutral-400">
                  Includes <span className="text-neutral-200">14-day free trial</span> •
                  Founding discount at checkout
                </div>
              </div>

              {/* Features */}
              <ul className="relative mt-6 space-y-2.5 text-sm text-neutral-200">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check size={16} className="mt-0.5" style={{ color: COPPER }} />
                    <span className="text-neutral-200">{f}</span>
                  </li>
                ))}
              </ul>

              {/* CTA (visual only — card itself is clickable) */}
              <div className="relative mt-7">
                <div
                  className={[
                    "w-full rounded-xl px-4 py-3 text-center text-sm font-extrabold text-black",
                    "shadow-[0_0_24px_rgba(212,118,49,0.35)] transition",
                    "group-hover:brightness-110",
                    "disabled:opacity-60",
                  ].join(" ")}
                  style={{
                    background:
                      "linear-gradient(to right, var(--accent-copper-soft), var(--accent-copper))",
                    border: "1px solid rgba(255,255,255,0.10)",
                  }}
                >
                  {isBusy ? "Starting…" : p.cta}
                </div>

                <div className="mt-3 text-[11px] text-neutral-400">
                  Cancel anytime • Secure checkout by Stripe
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default PricingSection;