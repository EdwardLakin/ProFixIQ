"use client";

import { useMemo, useState } from "react";

import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

import type { Database } from "@shared/types/types/supabase";
import { PLAN_LOOKUP_KEYS, type PlanKey } from "@/features/stripe/lib/stripe/constants";

type DB = Database;

type UiPlan = {
  key: PlanKey;
  name: string;
  description: string;
  priceLabel: string;
  features: string[];
};

export default function PlanSelectionPage() {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [selectedPlan, setSelectedPlan] = useState<PlanKey | null>(null);
  const [loading, setLoading] = useState(false);

  const PLANS: UiPlan[] = useMemo(
    () => [
      {
        key: "pro30",
        name: "Pro",
        description: "Full system for shops up to 30 users",
        priceLabel: "$300 / month",
        features: [
          "Work orders + invoicing",
          "Inspections + templates",
          "Parts + inventory",
          "AI assistant + diagnostics",
          "Up to 30 team users",
        ],
      },
      {
        key: "unlimited",
        name: "Unlimited",
        description: "For larger teams (no user cap)",
        priceLabel: "$500 / month",
        features: [
          "Everything in Pro",
          "Unlimited team users",
          "Best for multi-tech shops",
          "Priority feature access (as released)",
        ],
      },
    ],
    [],
  );

  async function handleCheckout(plan: PlanKey) {
    if (loading) return;

    setSelectedPlan(plan);
    setLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        alert("You must be signed in");
        return;
      }

      // You store plan on shop; user limits are enforced by DB triggers now.
      const { data: profile, error: profErr } = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("id", user.id)
        .maybeSingle();

      if (profErr) {
        alert(profErr.message);
        return;
      }

      const shopId = profile?.shop_id ?? null;
      if (!shopId) {
        alert("No shop found for this user.");
        return;
      }

      // Your /api/stripe/checkout route expects: { planKey: "price_*", shopId, userId? }
      // We resolve the correct Stripe price server-side via lookup key.
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lookupKey: PLAN_LOOKUP_KEYS[plan],
          shopId,
          userId: user.id,
        }),
      });

      const j = (await res.json().catch(() => ({}))) as { url?: string; error?: string };

      if (!res.ok || !j.url) {
        alert(j.error || "Checkout failed");
        return;
      }

      window.location.href = j.url;
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen px-4 py-14 text-neutral-100 bg-[radial-gradient(circle_at_top,_#050910,_#020308_60%,_#000)]">
      <div className="mx-auto w-full max-w-6xl text-center">
        <div className="font-blackops text-[0.75rem] tracking-[0.28em] text-neutral-300">
          PROFIXIQ BILLING
        </div>
        <h1 className="mt-2 text-3xl sm:text-4xl font-semibold text-neutral-50">
          Choose your plan
        </h1>
        <p className="mt-2 text-sm text-neutral-300">
          Burnt copper • glass cards • monthly plans • upgrade anytime.
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {PLANS.map((plan) => {
            const active = selectedPlan === plan.key;
            const primary = plan.key === "unlimited";

            return (
              <button
                key={plan.key}
                onClick={() => void handleCheckout(plan.key)}
                disabled={loading}
                className={[
                  "text-left rounded-2xl border p-6 transition",
                  "border-[var(--metal-border-soft)] bg-black/35 backdrop-blur",
                  "shadow-[0_24px_80px_rgba(0,0,0,0.75)]",
                  "hover:bg-black/45 hover:border-[color:var(--accent-copper-soft)]",
                  active
                    ? "ring-1 ring-[color:var(--accent-copper)]/40 border-[color:var(--accent-copper)]/70 shadow-[0_0_30px_rgba(212,118,49,0.22)]"
                    : "",
                  primary ? "md:translate-y-[-2px]" : "",
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-blackops text-[0.7rem] tracking-[0.24em] text-[var(--accent-copper-light)]">
                      {plan.name.toUpperCase()}
                    </div>
                    <div className="mt-1 text-sm text-neutral-200">{plan.description}</div>
                  </div>

                  {primary ? (
                    <div className="rounded-full border border-[var(--metal-border-soft)] bg-black/40 px-3 py-1 text-[0.65rem] uppercase tracking-[0.18em] text-neutral-200">
                      Recommended
                    </div>
                  ) : null}
                </div>

                <div className="mt-5 flex items-end gap-2">
                  <div className="text-3xl font-semibold text-neutral-50">{plan.priceLabel}</div>
                </div>

                <ul className="mt-5 space-y-2 text-sm text-neutral-200">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <span className="mt-[0.2rem] inline-block h-1.5 w-1.5 rounded-full bg-[color:var(--accent-copper)] shadow-[0_0_14px_rgba(212,118,49,0.55)]" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-6 flex items-center gap-2">
                  <span
                    className={[
                      "inline-flex rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em]",
                      "bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] text-black",
                      "shadow-[0_0_20px_rgba(212,118,49,0.55)]",
                      loading && active ? "opacity-70" : "hover:brightness-110",
                    ].join(" ")}
                  >
                    {loading && active ? "Starting…" : "Choose plan"}
                  </span>

                  <span className="text-[11px] text-neutral-400">
                    Limits enforced automatically.
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <p className="mt-10 text-xs text-neutral-500">
          You can change plans anytime. Payments are handled securely by Stripe.
        </p>
      </div>
    </div>
  );
}