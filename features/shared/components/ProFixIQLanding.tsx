// app/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Toaster } from "sonner";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

import LandingHero from "@shared/components/ui/LandingHero";
import LandingShopBoost from "@shared/components/ui/LandingShopBoost";
import RealShopDayFlow from "@shared/components/ui/RealShopDayFlow";
import FeaturesSection from "@shared/components/ui/FeaturesSection";
import WhySection from "@shared/components/ui/WhySection";
import PricingSection from "@shared/components/ui/PricingSection";
import Footer from "@shared/components/ui/Footer";
import Container from "@shared/components/ui/Container";
import LandingChatbot from "@/features/landing/LandingChatbot";
import LandingReviews from "@shared/components/ui/LandingReviews";

type Interval = "monthly" | "yearly";

export default function ProFixIQLanding() {
  const supabase = createBrowserSupabase();
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

  const startCheckout = async ({ planKey, interval }: { planKey: string; interval: Interval }) => {
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "pricing_cta",
        planKey,
        interval,
        enableTrial: true,
        applyFoundingDiscount: true,
        cancelPath: "/compare-plans",
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.url) {
      throw new Error(String(data?.error ?? data?.details ?? "Unable to start checkout"));
    }

    window.location.href = data.url;
  };

  return (
    <div className="relative min-h-screen text-[color:var(--theme-text-primary)]">
      <Toaster position="top-center" />

      {/* Dark steel + copper signal background */}
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage: [
            // base steel falloff
            "radial-gradient(1200px 700px at 20% -10%, rgba(148,163,184,0.18), transparent 55%)",
            "radial-gradient(1000px 650px at 85% 0%, var(--theme-surface-inset), transparent 60%)",
            "var(--theme-gradient-panel)",
            // copper “signal” sources
            "radial-gradient(550px 250px at 18% 18%, rgba(197,122,74,0.22), transparent 65%)",
            "radial-gradient(500px 240px at 80% 65%, rgba(197,122,74,0.14), transparent 70%)",
            // steel scanlines / texture
            "var(--theme-gradient-panel)",
            // subtle diagonal steel grain
            "var(--theme-gradient-panel)",
          ].join(", "),
          backgroundColor: "var(--theme-surface-panel)",
        }}
      />

      {/* Top bar (ops header) */}
      <div className="sticky top-0 z-30 w-full border-b border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] backdrop-blur-xl">
        <Container>
          <div className="flex items-center justify-between gap-3 py-3">
            <Link href="/" className="flex items-center gap-3">
              <div
                className="grid h-9 w-9 place-items-center rounded-xl border bg-[color:var(--theme-surface-inset)]"
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
                <div className="text-sm font-semibold text-[color:var(--theme-text-primary)]">ProFixIQ</div>
                <div className="flex items-center gap-2 text-[11px] text-[color:var(--theme-text-secondary)]">
                  {/* ✅ wording tweak: match your “Shop OS / modern repair shops” positioning */}
                  <span>Shop OS for Heavy-Duty • Automotive • Fleet</span>
                  <span className="text-[color:var(--theme-text-muted)]">•</span>
                  <span className="inline-flex items-center gap-1">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: "rgba(197,122,74,0.9)" }}
                    />
                    <span className="text-[color:var(--theme-text-muted)]">Signal</span>
                  </span>
                </div>
              </div>
            </Link>

            <div className="flex items-center gap-2">
              {/* Always visible portal entry */}
              <Link
                href="/portal"
                className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-1.5 text-sm font-extrabold text-[color:var(--theme-text-primary)] transition hover:bg-[color:var(--theme-surface-panel)]"
                style={{
                  boxShadow: "0 0 0 1px rgba(197,122,74,0.08) inset",
                }}
              >
                Portal Sign In
              </Link>

              <Link
                href="/portal/fleet"
                className="hidden sm:inline-flex items-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-1.5 text-sm font-semibold text-[color:var(--theme-text-primary)] transition hover:bg-[color:var(--theme-surface-panel)]"
              >
                Fleet Portal
              </Link>

              {sessionExists ? (
                <>
                  <Link
                    href="/dashboard"
                    className="hidden sm:inline-flex rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-1.5 text-sm text-[color:var(--theme-text-primary)] transition hover:bg-[color:var(--theme-surface-panel)]"
                  >
                    Dashboard
                  </Link>

                  <button
                    onClick={handleSignOut}
                    className="inline-flex rounded-xl px-3 py-1.5 text-sm font-extrabold text-[color:var(--theme-text-on-accent)] transition"
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
                  className="inline-flex rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-1.5 text-sm font-semibold text-[color:var(--theme-text-primary)] transition hover:bg-[color:var(--theme-surface-panel)]"
                >
                  Sign In
                </Link>
              )}
            </div>
          </div>
        </Container>
      </div>

      {/* HERO (full-bleed) */}
      <LandingHero />

      {/* SHOP BOOST */}
      <div id="shop-boost">
        <LandingShopBoost />
      </div>

      {/* ✅ REAL SHOP DAY FLOW (NEW) */}
      <section id="real-shop-day" className="relative py-16 md:py-20">
        <Container>
          <RealShopDayFlow />
        </Container>
      </section>

      {/* FEATURES */}
      <section id="features" className="relative py-16 md:py-20">
        <Container>
          <div className="mx-auto max-w-3xl text-center">
            <div
              className="text-xs font-semibold uppercase tracking-[0.22em]"
              style={{ color: "var(--pfq-copper)" }}
            >
              Included
            </div>
            <h2
              className="mt-2 text-3xl text-[color:var(--theme-text-primary)] md:text-5xl"
              style={{ fontFamily: "var(--font-blackops)" }}
            >
              Everything included. One workflow.
            </h2>
            <p className="mt-3 text-sm text-[color:var(--theme-text-secondary)] md:text-base">
              Fleet-first tools that also work great for automotive — built to
              reduce screen time and keep work moving.
            </p>
          </div>

          <div className="mt-12">
            <FeaturesSection showHeading={false} />
          </div>
        </Container>
      </section>

      {/* WHY */}
      <section id="why" className="relative py-16 md:py-20">
        <Container>
          <WhySection />
        </Container>
      </section>

      {/* REVIEWS */}
      <section id="reviews" className="relative py-16 md:py-20">
        <LandingReviews />
      </section>

      {/* PRICING */}
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
              className="mt-2 text-3xl text-[color:var(--theme-text-primary)] md:text-5xl"
              style={{ fontFamily: "var(--font-blackops)" }}
            >
              One complete product. No feature tax.
            </h2>
            <p className="mt-3 text-sm text-[color:var(--theme-text-secondary)] md:text-base">
              Every Complete plan includes repair ops plus workforce scheduling, attendance, documents, certifications, readiness, and Payroll Connect foundation for payroll review/export readiness.
            </p>
          </div>

                    <div className="mt-10">
            <PricingSection
              onCheckout={async ({
                planKey,
                interval,
              }: {
                planKey: string;
                interval: Interval;
              }) => {
                await startCheckout({ planKey, interval });
              }}
              onStartFree={() => {
                window.location.href = "/compare-plans";
              }}
            />
          </div>

          {/* CTA band */}
          <div className="mt-10 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-6 py-6 backdrop-blur">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-lg font-extrabold text-[color:var(--theme-text-primary)]">
                  Ready to see it in motion?
                </div>
                <div className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
                  Create a work order, run an inspection, or let AI scan your
                  shop&apos;s history.
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  href="/work-orders/create"
                  className="rounded-xl px-4 py-2 text-sm font-extrabold text-[color:var(--theme-text-on-accent)]"
                  style={{
                    background: "var(--pfq-copper)",
                    border: "1px solid rgba(255,255,255,0.10)",
                    boxShadow: "0 0 26px rgba(197,122,74,0.25)",
                  }}
                >
                  Start a work order
                </Link>
                <Link
                  href="/demo/instant-shop-analysis"
                  className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-4 py-2 text-sm font-semibold text-[color:var(--theme-text-primary)] transition hover:bg-[color:var(--theme-surface-panel)]"
                >
                  Run Instant Shop Analysis
                </Link>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* Chatbot */}
      <div className="relative">
        <LandingChatbot />
      </div>

      {/* Footer */}
      <div className="relative">
        <Footer />
      </div>
    </div>
  );
}
