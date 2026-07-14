// features/shared/components/ui/PricingSection.tsx

"use client";

import type { FC } from "react";
import { useMemo, useState } from "react";
import { Check, Sparkles, Timer } from "lucide-react";
import type { PlanKey } from "@/features/stripe/lib/stripe/constants";

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

export type BillingInterval = "monthly" | "yearly";

export type CheckoutPayload = {
  planKey: PlanKey;
  interval: BillingInterval;
};

export type PricingSectionProps = {
  onCheckout: (payload: CheckoutPayload) => void | Promise<void>;
  onStartFree: () => void;
};

type CheckoutPricingPlan = {
  key: PlanKey;
  checkoutEnabled: true;
  title: string;
  desc: string;
  priceLabel: string;
  subLabel: string;
  features: string[];
  cta: string;
  featured: boolean;
  badge?: string;
};

type ContactPricingPlan = {
  key: string;
  checkoutEnabled: false;
  title: string;
  desc: string;
  priceLabel: string;
  subLabel: string;
  features: string[];
  cta: string;
  featured: boolean;
  badge?: string;
};

type PricingPlan = CheckoutPricingPlan | ContactPricingPlan;

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
        key: "starter",
        checkoutEnabled: true,
        title: "Complete 10",
        desc: "One complete shop operating system for smaller teams. Full platform access with pricing sized for up to 10 active users.",
        priceLabel: "$299 / month",
        subLabel: "Up to 10 active users",
        features: [
          "14-day free trial included",
          "Up to 10 active users (techs, advisors, parts, admin)",
          "Full repair operations: work orders, inspections, approvals, parts, and invoicing",
          "Workforce Command: scheduling + attendance",
          "Documents/certifications + Required Document Matrix readiness",
          "Payroll review and export readiness with provider-ready export workflows",
        ],
        featured: false,
        cta: "Start free trial",
      },
      {
        key: "pro",
        checkoutEnabled: true,
        title: "Complete 50",
        desc: "One complete shop operating system for growing shops. Full platform access with pricing sized for up to 50 active users.",
        priceLabel: "$399 / month",
        subLabel: "Up to 50 active users",
        features: [
          "14-day free trial included",
          "Up to 50 active users (techs, advisors, parts, admin)",
          "Everything in Complete 10 + expanded implementation support",
          "Customer + fleet portal workflows included",
          "Priority support",
          "Payroll Connect foundation + review/export readiness",
        ],
        featured: true,
        badge: "Most popular",
        cta: "Start free trial",
      },
      {
        key: "complete-100",
        checkoutEnabled: false,
        title: "Complete 100",
        desc: "Complete platform for high-capacity shops scaling toward 100 active users. Contact-only rollout with guided implementation.",
        priceLabel: "Talk to us",
        subLabel: "Up to 100 active users",
        features: [
          "Everything in Complete plans",
          "Sized for up to 100 active users",
          "Implementation planning and rollout guidance",
          "Payroll Connect foundation + provider-ready export workflows",
          "Contact-only rollout: Talk to us for implementation planning",
        ],
        featured: false,
        badge: "Coming soon",
        cta: "Talk to us",
      },
      {
        key: "unlimited",
        checkoutEnabled: true,
        title: "Complete Unlimited",
        desc: "One complete shop operating system for larger operations with unlimited active users per location.",
        priceLabel: "$599 / month / location",
        subLabel: "Unlimited users",
        features: [
          "14-day free trial included",
          "Unlimited active users per location",
          "Everything in Complete plans with enterprise-scale operations",
          "High-volume fleet + municipality readiness",
          "Priority support with implementation coordination",
          "Provider-ready payroll export workflows",
        ],
        featured: false,
        cta: "Start free trial",
      },
    ],
    [],
  );

  async function handlePlanClick(key: PlanKey): Promise<void> {
    if (busyKey) return;
    setBusyKey(key);

    try {
      await onCheckout({
        planKey: key,
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
            <span className="mx-1 text-[color:var(--theme-text-muted)]">•</span>
            <Sparkles size={14} />
            <span>Founding Shop offer (6 months discounted)</span>
          </div>

          <p className="text-sm text-[color:var(--theme-text-secondary)]">
            Every Complete plan includes the full ProFixIQ platform. Pricing scales by shop size, not by feature access.
          </p>

          <p className="text-xs text-[color:var(--theme-text-secondary)]">
            One complete product. No feature tax. Repair operations, workforce scheduling, attendance, documents, certifications, readiness, customer/fleet portals, and Payroll Connect foundation are included.
          </p>

          <button
            type="button"
            onClick={onStartFree}
            className={[
              "mt-1 inline-flex items-center justify-center rounded-xl px-5 py-2.5 text-sm font-extrabold text-[color:var(--theme-text-on-accent)]",
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
      <div
        className="mt-5 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3 text-xs text-[color:var(--theme-text-secondary)]"
      >
        SMS, payment processing, heavy AI usage, storage overages, and custom integrations may be billed separately.
      </div>

      <div className="mt-5 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-3 text-xs text-[color:var(--theme-text-secondary)]">
        Payroll Connect supports operational payroll review and export readiness. Payroll processing, tax filing/remittance, benefits administration, and legal compliance services remain handled by your payroll/HR providers.
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((p) => {
          const isBusy = p.checkoutEnabled ? busyKey === p.key : false;

          return (
            <button
              key={`${p.key}-${p.title}`}
              type="button"
              onClick={() => (p.checkoutEnabled ? void handlePlanClick(p.key) : (window.location.href = "/#contact"))}
              disabled={Boolean(busyKey) || !p.checkoutEnabled}
              className={[
                "group relative text-left",
                "rounded-3xl border bg-[color:var(--theme-surface-inset)] p-6 backdrop-blur-xl transition",
                "shadow-[var(--theme-shadow-medium)]",
                "hover:bg-[color:var(--theme-surface-inset)] hover:-translate-y-[2px]",
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
                      className="text-2xl text-[color:var(--theme-text-primary)]"
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

                  <div className="mt-1 text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--theme-text-secondary)]">
                    {p.subLabel}
                  </div>

                  <p className="mt-3 text-sm text-[color:var(--theme-text-secondary)]">{p.desc}</p>
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
                <div className="mt-2 text-xs text-[color:var(--theme-text-secondary)]">
                  Includes <span className="text-[color:var(--theme-text-primary)]">full platform access</span> •
                  Founding discount at checkout
                </div>
              </div>

              {/* Features */}
              <ul className="relative mt-6 space-y-2.5 text-sm text-[color:var(--theme-text-primary)]">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check size={16} className="mt-0.5" style={{ color: COPPER }} />
                    <span className="text-[color:var(--theme-text-primary)]">{f}</span>
                  </li>
                ))}
              </ul>

              {/* CTA (visual only — card itself is clickable) */}
              <div className="relative mt-7">
                <div
                  className={[
                    "w-full rounded-xl px-4 py-3 text-center text-sm font-extrabold text-[color:var(--theme-text-on-accent)]",
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

                <div className="mt-3 text-[11px] text-[color:var(--theme-text-secondary)]">
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
