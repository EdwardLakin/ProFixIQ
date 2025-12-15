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
  interval: string; // "month"
  subtitle: string;
  bullets: string[];
};

function fmtMoney(amountCents: number, currency: string): string {
  const cur = String(currency ?? "usd").toUpperCase();
  const dollars = (amountCents / 100).toFixed(0);
  return `${cur} $${dollars}`;
}

export default function PlanComparison() {
  const [prices, setPrices] = useState<StripePrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const loadPlans = async () => {
      try {
        const res = await fetch("/api/plans", { cache: "no-store" });
        const planData = (await res.json()) as StripePrice[];
        setPrices(Array.isArray(planData) ? planData : []);
      } catch {
        setPrices([]);
      } finally {
        setLoading(false);
      }
    };
    void loadPlans();
  }, []);

  const uiPlans = useMemo<UiPlan[]>(() => {
    // We only support TWO plans: pro30 + unlimited (monthly)
    const wanted: Array<{ key: PlanKey; lookup: string }> = [
      { key: "pro30", lookup: PLAN_LOOKUP_KEYS.pro30 },
      { key: "unlimited", lookup: PLAN_LOOKUP_KEYS.unlimited },
    ];

    // Find active monthly-ish prices by lookup_key
    const found = wanted
      .map(({ key, lookup }) => {
        const match = prices.find((p) => {
          const lk = String(p.lookup_key ?? "").trim();
          const interval = String(p.recurring?.interval ?? "").trim();
          return lk === lookup && (interval === "month" || interval === "monthly" || interval === "");
        });

        if (!match?.id || typeof match.unit_amount !== "number" || !match.currency) return null;

        const base: Omit<UiPlan, "subtitle" | "bullets"> = {
          key,
          priceId: match.id,
          title: key === "pro30" ? "Pro" : "Unlimited",
          amountCents: match.unit_amount,
          currency: match.currency,
          interval: "month",
        };

        if (key === "pro30") {
          return {
            ...base,
            subtitle: "Up to 30 users • $300 / month",
            bullets: [
              "Work orders + invoicing",
              "Inspections + templates",
              "Parts + inventory",
              "AI assistant + diagnostics",
              "Up to 30 team users",
            ],
          };
        }

        return {
          ...base,
          subtitle: "Unlimited users • $500 / month",
          bullets: [
            "Everything in Pro",
            "Unlimited team users",
            "Best for multi-tech shops",
            "Priority feature access (as released)",
          ],
        };
      })
      .filter((x): x is UiPlan => Boolean(x));

    // Keep fixed order
    const order: PlanKey[] = ["pro30", "unlimited"];
    found.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));

    return found;
  }, [prices]);

  async function handleCheckout(priceId: string) {
    if (busyId) return;
    setBusyId(priceId);

    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Server route in your app expects planKey (Stripe price id)
        body: JSON.stringify({ planKey: priceId }),
      });

      const j = (await res.json().catch(() => ({}))) as { url?: string; error?: string };

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
    <section className="px-4 py-14 text-neutral-100 bg-[radial-gradient(circle_at_top,_#050910,_#020308_60%,_#000)]">
      <div className="mx-auto w-full max-w-6xl">
        <div className="text-center">
          <div className="font-blackops text-[0.75rem] tracking-[0.28em] text-neutral-300">
            PROFIXIQ PLANS
          </div>
          <h2 className="mt-2 text-3xl sm:text-4xl font-semibold text-neutral-50">
            Simple pricing for real shops
          </h2>
          <p className="mt-2 text-sm text-neutral-300">
            Two plans. Monthly only. Upgrade anytime.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
          {loading ? (
            <>
              <div className="rounded-2xl border border-[var(--metal-border-soft)] bg-black/35 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.75)] backdrop-blur">
                <div className="h-6 w-40 rounded bg-white/10" />
                <div className="mt-3 h-10 w-48 rounded bg-white/10" />
                <div className="mt-6 space-y-2">
                  <div className="h-4 w-full rounded bg-white/10" />
                  <div className="h-4 w-5/6 rounded bg-white/10" />
                  <div className="h-4 w-2/3 rounded bg-white/10" />
                </div>
              </div>
              <div className="rounded-2xl border border-[var(--metal-border-soft)] bg-black/35 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.75)] backdrop-blur">
                <div className="h-6 w-40 rounded bg-white/10" />
                <div className="mt-3 h-10 w-48 rounded bg-white/10" />
                <div className="mt-6 space-y-2">
                  <div className="h-4 w-full rounded bg-white/10" />
                  <div className="h-4 w-5/6 rounded bg-white/10" />
                  <div className="h-4 w-2/3 rounded bg-white/10" />
                </div>
              </div>
            </>
          ) : uiPlans.length === 0 ? (
            <div className="md:col-span-2 rounded-2xl border border-[var(--metal-border-soft)] bg-black/35 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.75)] backdrop-blur">
              <div className="text-sm text-neutral-200">Plans unavailable.</div>
              <div className="mt-1 text-xs text-neutral-400">
                Make sure Stripe Prices have the lookup keys:
                <span className="ml-2 font-mono text-neutral-300">
                  {PLAN_LOOKUP_KEYS.pro30}
                </span>
                <span className="mx-2 text-neutral-500">•</span>
                <span className="font-mono text-neutral-300">
                  {PLAN_LOOKUP_KEYS.unlimited}
                </span>
              </div>
            </div>
          ) : (
            uiPlans.map((p) => {
              const primary = p.key === "unlimited";
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
                        Recommended
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
                    onClick={() => handleCheckout(p.priceId)}
                    disabled={busyId === p.priceId}
                    className={[
                      "mt-6 w-full rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-black",
                      "bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))]",
                      "shadow-[0_0_20px_rgba(212,118,49,0.55)] hover:brightness-110 disabled:opacity-60",
                    ].join(" ")}
                  >
                    {busyId === p.priceId ? "Starting…" : "Choose plan"}
                  </button>

                  <div className="mt-3 text-[11px] text-neutral-400">
                    Users are enforced in-app (Pro: 30 • Unlimited: no cap).
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