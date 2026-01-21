// app/landing/PlanComparison.tsx

"use client";

import { useEffect, useMemo, useState } from "react";
import { PLAN_LOOKUP_KEYS, type PlanKey } from "@/features/stripe/lib/stripe/constants";

type StripePrice = {
  id: string;
  nickname: string | null;
  unit_amount: number | null;
  currency: string | null;
  recurring?: { interval?: string | null } | null;
  lookup_key?: string | null;
};

type UiPlan = {
  key: PlanKey;
  priceId: string;
  title: string;
  amountCents: number;
  currency: string;
  interval: "month";
  subtitle: string;
  bullets: string[];
  recommended: boolean;
};

function fmtMoney(amountCents: number, currency: string): string {
  const cur = String(currency ?? "usd").toUpperCase();
  const dollars = (amountCents / 100).toFixed(0);
  return `${cur} $${dollars}`;
}

function isUiPlan(v: UiPlan | null): v is UiPlan {
  return v !== null;
}

export default function PlanComparison() {
  const [prices, setPrices] = useState<StripePrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const loadPlans = async () => {
      try {
        const res = await fetch("/api/plans", { cache: "no-store" });
        const planData = (await res.json()) as unknown;
        setPrices(Array.isArray(planData) ? (planData as StripePrice[]) : []);
      } catch {
        setPrices([]);
      } finally {
        setLoading(false);
      }
    };
    void loadPlans();
  }, []);

  const uiPlans = useMemo<UiPlan[]>(() => {
    const wanted: Array<{ key: PlanKey; lookup: string; title: string }> = [
      { key: "starter10", lookup: PLAN_LOOKUP_KEYS.starter10, title: "Starter" },
      { key: "pro50", lookup: PLAN_LOOKUP_KEYS.pro50, title: "Pro" },
      { key: "unlimited", lookup: PLAN_LOOKUP_KEYS.unlimited, title: "Unlimited" },
    ];

    const found: UiPlan[] = wanted
      .map(({ key, lookup, title }): UiPlan | null => {
        const match = prices.find((p) => {
          const lk = String(p.lookup_key ?? "").trim();
          const interval = String(p.recurring?.interval ?? "").trim();
          return (
            lk === lookup &&
            (interval === "month" || interval === "monthly" || interval === "")
          );
        });

        if (
          !match?.id ||
          typeof match.unit_amount !== "number" ||
          !match.currency
        ) {
          return null;
        }

        const base = {
          key,
          priceId: match.id,
          title,
          amountCents: match.unit_amount,
          currency: match.currency,
          interval: "month" as const,
        };

        if (key === "starter10") {
          return {
            ...base,
            subtitle: "Up to 10 users • 14-day free trial",
            bullets: [
              "Measured inspections + photo proof",
              "Quotes + approvals",
              "Customer portal",
              "Internal messaging + role dashboards",
              "Up to 10 team users",
            ],
            recommended: false,
          };
        }

        if (key === "pro50") {
          return {
            ...base,
            subtitle: "Up to 50 users • 14-day free trial",
            bullets: [
              "Everything in Starter",
              "Built for HD + fleet workflows (works for automotive too)",
              "Automation from inspection → quote",
              "Role-based dashboards",
              "Up to 50 team users",
            ],
            recommended: true,
          };
        }

        return {
          ...base,
          subtitle: "Unlimited users • 14-day free trial",
          bullets: [
            "Everything in Pro",
            "Unlimited users per location",
            "Best for fleets + larger operations",
            "Multi-role teams (dispatch/ops/parts/advisors/techs)",
            "Priority support",
          ],
          recommended: false,
        };
      })
      .filter(isUiPlan);

    const order: PlanKey[] = ["starter10", "pro50", "unlimited"];
    const orderIndex: Record<PlanKey, number> = {
      starter10: 0,
      pro50: 1,
      unlimited: 2,
    };

    found.sort((a, b) => (orderIndex[a.key] ?? order.length) - (orderIndex[b.key] ?? order.length));

    return found;
  }, [prices]);

  async function handleCheckout(lookupKey: string) {
    if (busyId) return;
    setBusyId(lookupKey);

    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planKey: lookupKey,
          enableTrial: true,
          trialDays: 14,
          applyFoundingDiscount: true,
        }),
      });

      const j = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };

      if (!res.ok || !j.url) {
        alert(j.error || "Checkout failed");
        return;
      }

      window.location.href = j.url;
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="bg-[radial-gradient(circle_at_top,_#050910,_#020308_60%,_#000)] px-4 py-14 text-neutral-100">
      <div className="mx-auto w-full max-w-6xl">
        <div className="text-center">
          <div className="font-blackops text-[0.75rem] tracking-[0.28em] text-neutral-300">
            PROFIXIQ PLANS
          </div>
          <h2 className="mt-2 text-3xl font-semibold text-neutral-50 sm:text-4xl">
            Simple pricing for real shops
          </h2>
          <p className="mt-2 text-sm text-neutral-300">
            14-day free trial on every plan. Founding Shop discount applies at checkout
            (6 months discounted).
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
          {loading ? (
            <>
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-[var(--metal-border-soft)] bg-black/35 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.75)] backdrop-blur"
                >
                  <div className="h-6 w-40 rounded bg-white/10" />
                  <div className="mt-3 h-10 w-48 rounded bg-white/10" />
                  <div className="mt-6 space-y-2">
                    <div className="h-4 w-full rounded bg-white/10" />
                    <div className="h-4 w-5/6 rounded bg-white/10" />
                    <div className="h-4 w-2/3 rounded bg-white/10" />
                  </div>
                </div>
              ))}
            </>
          ) : uiPlans.length === 0 ? (
            <div className="rounded-2xl border border-[var(--metal-border-soft)] bg-black/35 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.75)] backdrop-blur md:col-span-3">
              <div className="text-sm text-neutral-200">Plans unavailable.</div>
              <div className="mt-1 text-xs text-neutral-400">
                Make sure Stripe Prices have the lookup keys:
                <div className="mt-2 space-y-1 font-mono text-neutral-300">
                  <div>{PLAN_LOOKUP_KEYS.starter10}</div>
                  <div>{PLAN_LOOKUP_KEYS.pro50}</div>
                  <div>{PLAN_LOOKUP_KEYS.unlimited}</div>
                </div>
              </div>
            </div>
          ) : (
            uiPlans.map((p) => {
              const primary = p.recommended;
              const lk = PLAN_LOOKUP_KEYS[p.key];

              return (
                <div
                  key={p.priceId}
                  className={[
                    "rounded-2xl border bg-black/35 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.75)] backdrop-blur",
                    "border-[var(--metal-border-soft)]",
                    primary
                      ? "ring-1 ring-[color:var(--accent-copper)]/35 shadow-[0_0_30px_rgba(212,118,49,0.22)]"
                      : "",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-blackops text-[0.7rem] tracking-[0.24em] text-[var(--accent-copper-light)]">
                        {p.title.toUpperCase()}
                      </div>
                      <div className="mt-1 text-xs text-neutral-300">{p.subtitle}</div>
                    </div>

                    {primary ? (
                      <div className="rounded-full border border-[var(--metal-border-soft)] bg-black/40 px-3 py-1 text-[0.65rem] uppercase tracking-[0.18em] text-neutral-200">
                        Most popular
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-5 flex items-end gap-2">
                    <div className="text-4xl font-semibold text-neutral-50">
                      {fmtMoney(p.amountCents, p.currency)}
                    </div>
                    <div className="pb-1 text-sm text-neutral-400">/ month</div>
                  </div>

                  <ul className="mt-5 space-y-2 text-sm text-neutral-200">
                    {p.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-2">
                        <span className="mt-[0.2rem] inline-block h-1.5 w-1.5 rounded-full bg-[color:var(--accent-copper)] shadow-[0_0_14px_rgba(212,118,49,0.55)]" />
                        <span className="text-neutral-200">{b}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={() => void handleCheckout(lk)}
                    disabled={busyId === lk}
                    className={[
                      "mt-6 w-full rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-black",
                      "bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))]",
                      "shadow-[0_0_20px_rgba(212,118,49,0.55)] hover:brightness-110 disabled:opacity-60",
                    ].join(" ")}
                  >
                    {busyId === lk ? "Starting…" : "Start free trial"}
                  </button>

                  <div className="mt-3 text-[11px] text-neutral-400">
                    14-day free trial • Founding Shop discount applies at checkout.
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}