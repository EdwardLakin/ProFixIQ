// app/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Toaster } from "sonner";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

import LandingHero from "@shared/components/ui/LandingHero";
import LandingShopBoost from "@shared/components/ui/LandingShopBoost";
import FeaturesSection from "@shared/components/ui/FeaturesSection";
import WhySection from "@shared/components/ui/WhySection";
import PricingSection from "@shared/components/ui/PricingSection";
import Footer from "@shared/components/ui/Footer";
import Container from "@shared/components/ui/Container";
import LandingChatbot from "@/features/landing/LandingChatbot";

type Interval = "monthly" | "yearly";

export default function ProFixIQLanding() {
  const supabase = createClientComponentClient<Database>();
  const [sessionExists, setSessionExists] = useState(false);

  useEffect(() => {
    let unsub: (() => void) | null = null;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setSessionExists(!!session);

      const { data } = supabase.auth.onAuthStateChange((_event, sess) => {
        setSessionExists(!!sess);
      });

      unsub = () => data.subscription.unsubscribe();
    })();

    return () => {
      unsub?.();
    };
  }, [supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setSessionExists(false);
    window.location.href = "/";
  };

  return (
    <div
      className="
        relative min-h-screen text-foreground text-white
        bg-background
        bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.14),transparent_55%),radial-gradient(circle_at_bottom,_rgba(15,23,42,0.96),#020617_78%)]
      "
    >
      <Toaster position="top-center" />

      {/* Top bar */}
      <div className="relative w-full border-b border-white/10 bg-black/35 backdrop-blur-xl">
        <Container>
          <div className="flex items-center justify-between gap-3 py-3">
            <Link href="/" className="flex items-center gap-3">
              <div
                className="grid h-9 w-9 place-items-center rounded-xl border bg-black/40"
                style={{
                  borderColor: "rgba(255,255,255,0.10)",
                  boxShadow: "0 0 0 1px rgba(255,255,255,0.04) inset",
                }}
              >
                <span
                  className="text-[11px] font-blackops tracking-[0.14em]"
                  style={{ color: "var(--pfq-copper)" }}
                >
                  PFQ
                </span>
              </div>
              <div className="leading-tight">
                <div className="text-sm font-semibold text-white">
                  ProFixIQ
                </div>
                <div className="text-[11px] text-neutral-500">
                  Inspections • Work Orders • AI • Portal
                </div>
              </div>
            </Link>

            <div className="flex items-center gap-2">
              <Link
                href="/portal"
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-1.5 text-sm font-semibold text-neutral-200 transition hover:bg-neutral-900/40"
              >
                Customer Portal
              </Link>

              {sessionExists ? (
                <>
                  <Link
                    href="/dashboard"
                    className="hidden sm:inline-flex rounded-xl border border-white/10 bg-black/25 px-3 py-1.5 text-sm text-neutral-200 transition hover:bg-neutral-900/40"
                  >
                    Dashboard
                  </Link>

                  <button
                    onClick={handleSignOut}
                    className="inline-flex rounded-xl px-3 py-1.5 text-sm font-semibold text-black transition"
                    style={{
                      background: "var(--pfq-copper)",
                      border: "1px solid rgba(255,255,255,0.10)",
                    }}
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <Link
                  href="/sign-in"
                  className="inline-flex rounded-xl border border-white/10 bg-black/25 px-3 py-1.5 text-sm text-neutral-200 transition hover:bg-neutral-900/40"
                >
                  Sign In
                </Link>
              )}
            </div>
          </div>
        </Container>
      </div>

      {/* 1) HERO */}
      <div className="relative">
        <LandingHero />
      </div>

      {/* 1B) SHOP BOOST SETUP */}
      <div className="relative" id="shop-boost">
        <LandingShopBoost />
      </div>

      {/* 2) FEATURES */}
      <section id="features" className="relative py-16 md:py-20">
        <Container>
          <div className="mx-auto max-w-3xl text-center">
            <div
              className="text-xs font-semibold uppercase tracking-[0.22em]"
              style={{ color: "var(--pfq-copper)" }}
            >
              Platform
            </div>
            <h2
              className="mt-2 text-3xl text-neutral-100 md:text-4xl"
              style={{ fontFamily: "var(--font-blackops)" }}
            >
              Powerful features, one workflow
            </h2>
            <p className="mt-3 text-sm text-neutral-400">
              Real tools that run the shop — inspections, work orders, messaging,
              portal, and AI planning.
            </p>
          </div>

          <div className="mt-10 rounded-3xl border border-white/10 bg-black/35 p-4 md:p-6 backdrop-blur-xl">
            <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <p className="text-sm text-neutral-400">
                Have questions? Open the chatbot and ask anything about ProFixIQ.
              </p>
              <div
                className="text-xs font-semibold"
                style={{ color: "var(--pfq-copper)" }}
              >
                Built to feel premium • Built to move fast
              </div>
            </div>

            <FeaturesSection showHeading={false} />
          </div>
        </Container>
      </section>

      {/* 3) WHY */}
      <section id="why" className="relative py-16 md:py-20">
        <Container>
          <div className="mx-auto max-w-3xl text-center">
            <div
              className="text-xs font-semibold uppercase tracking-[0.22em]"
              style={{ color: "var(--pfq-copper)" }}
            >
              Why it wins
            </div>
            <h2
              className="mt-2 text-3xl text-neutral-100 md:text-4xl"
              style={{ fontFamily: "var(--font-blackops)" }}
            >
              Clarity for techs. Control for advisors.
            </h2>
            <p className="mt-3 text-sm text-neutral-400">
              Consistency on the floor, clean communication, and fewer misses —
              without adding admin work.
            </p>
          </div>

          <div className="mt-10 rounded-3xl border border-white/10 bg-neutral-950/55 p-4 md:p-6 backdrop-blur-xl">
            <WhySection />
          </div>
        </Container>
      </section>

      {/* 4) PRICING */}
      <section id="plans" className="relative py-16 md:py-20">
        <Container>
          <div className="mx-auto max-w-3xl text-center">
            <div
              className="text-xs font-semibold uppercase tracking-[0.22em]"
              style={{ color: "var(--pfq-copper)" }}
            >
              Plans
            </div>
            <h2
              className="mt-2 text-3xl text-neutral-100 md:text-4xl"
              style={{ fontFamily: "var(--font-blackops)" }}
            >
              Pricing that scales with the shop
            </h2>
            <p className="mt-3 text-sm text-neutral-400">
              Start lean, upgrade when you’re ready — no messy migration later.
            </p>
          </div>

          <div className="mt-10 rounded-3xl border border-white/10 bg-black/35 p-4 md:p-6 backdrop-blur-xl">
            <PricingSection
              onCheckout={async ({
                priceId,
                interval,
              }: {
                priceId: string;
                interval: Interval;
              }) => {
                const res = await fetch("/api/stripe/checkout", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    planKey: priceId,
                    shopId: "public_landing",
                    userId: null,
                    interval,
                  }),
                });

                const data = await res.json().catch(() => ({}));

                if (!res.ok) {
                  alert(data?.details || data?.error || "Checkout failed");
                  return;
                }

                if (data?.url) {
                  window.location.href = data.url;
                  return;
                }

                alert("No checkout URL returned");
              }}
              onStartFree={() => {
                window.location.href = "/onboarding/profile";
              }}
            />
          </div>

          {/* CTA band */}
          <div className="mt-8 rounded-3xl border border-white/10 bg-black/25 p-5 md:p-6 backdrop-blur-xl">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-lg font-semibold text-white">
                  Ready to see it in motion?
                </div>
                <div className="mt-1 text-sm text-neutral-400">
                  Create a work order, run an inspection, and let the system do
                  the rest.
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  href="/work-orders/create"
                  className="rounded-xl px-4 py-2 text-sm font-semibold text-black"
                  style={{
                    background: "var(--pfq-copper)",
                    border: "1px solid rgba(255,255,255,0.10)",
                  }}
                >
                  Start a work order
                </Link>
                <Link
                  href="/agent/planner"
                  className="rounded-xl border border-white/10 bg-black/25 px-4 py-2 text-sm font-semibold text-neutral-200 transition hover:bg-neutral-900/40"
                >
                  Open AI planner
                </Link>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* 5) Chatbot */}
      <div className="relative">
        <LandingChatbot />
      </div>

      {/* 6) Footer */}
      <div className="relative">
        <Footer />
      </div>
    </div>
  );
}