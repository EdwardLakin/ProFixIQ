"use client";

import { Check } from "lucide-react";
import { PRICE_IDS } from "@stripe/lib/stripe/constants";

export type CheckoutPayload = {
  priceId: string; // Stripe price_...
  interval: "monthly" | "yearly";
};

type PricingSectionProps = {
  onCheckout: (payload: CheckoutPayload) => void | Promise<void>;
  onStartFree: () => void; // you can keep this for trial/onboarding
};

type PlanKey = "pro_30" | "unlimited";

export default function PricingSection({
  onCheckout,
  onStartFree,
}: PricingSectionProps) {
  // Right now: monthly only. Keep the interval param for compatibility.
  const interval: CheckoutPayload["interval"] = "monthly";

  const pick = (key: PlanKey) => {
    // If your constants file doesn’t have these yet, replace with hardcoded "price_..."
    const anyIds = PRICE_IDS as unknown as Record<
      string,
      { monthly: string; yearly?: string }
    >;

    const row = anyIds[key];
    if (!row?.monthly) {
      // Safe fallback: keep the UI usable during dev
      return "price_TODO";
    }
    return row.monthly;
  };

  const plans: Array<{
    key: PlanKey;
    title: string;
    price: string;
    desc: string;
    features: string[];
    featured?: boolean;
    cta: string;
    onClick: () => void;
  }> = [
    {
      key: "pro_30",
      title: "Shop (Up to 30 users)",
      price: "$300 / month",
      desc: "Full access. Built for most repair shops.",
      features: [
        "Unlimited access to all features",
        "Up to 30 users (techs, advisors, parts, admin)",
        "AI Planner + inspections + portal + messaging",
        "Priority support",
      ],
      featured: true,
      cta: "Start",
      onClick: () => onCheckout({ priceId: pick("pro_30"), interval }),
    },
    {
      key: "unlimited",
      title: "Shop (Unlimited users)",
      price: "$500 / month",
      desc: "Full access at scale — no seat math.",
      features: [
        "Unlimited access to all features",
        "Unlimited users",
        "Best for multi-shift or multi-location ops",
        "Priority support",
      ],
      cta: "Start",
      onClick: () => onCheckout({ priceId: pick("unlimited"), interval }),
    },
  ];

  return (
    <div className="w-full">
      <div className="mx-auto mb-8 max-w-3xl text-center">
        <p className="text-sm text-neutral-300">
          No feature gating. Full access from day one.
        </p>
        <p className="mt-2 text-xs text-neutral-500">
          Considering a 1-week free trial — button below can route to onboarding
          while pricing finalizes.
        </p>

        <button
          onClick={onStartFree}
          className="mt-4 rounded-xl border border-white/10 bg-black/25 px-4 py-2 text-sm font-semibold text-neutral-200 hover:bg-neutral-900/40 transition"
        >
          Start trial / onboarding
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {plans.map((p) => (
          <div
            key={p.key}
            className={[
              "rounded-3xl border bg-black/30 p-6 backdrop-blur-xl",
              p.featured ? "border-white/20" : "border-white/10",
            ].join(" ")}
            style={
              p.featured
                ? {
                    boxShadow: "0 0 0 1px rgba(193,102,59,0.22) inset",
                  }
                : undefined
            }
          >
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

            <div className="mt-5 flex items-baseline gap-2">
              <div
                className="text-3xl font-bold"
                style={{ color: "var(--accent-copper-light)" }}
              >
                {p.price}
              </div>
            </div>

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

            <button
              onClick={p.onClick}
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