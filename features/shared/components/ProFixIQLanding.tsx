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
import LandingReviews from "@shared/components/ui/LandingReviews";

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
    <div className="relative min-h-screen text-white">
      <Toaster position="top-center" />

      {/* Dark steel + copper signal background */}
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage: [
            // base steel falloff
            "radial-gradient(1200px 700px at 20% -10%, rgba(148,163,184,0.18), transparent 55%)",
            "radial-gradient(1000px 650px at 85% 0%, rgba(30,41,59,0.55), transparent 60%)",
            "radial-gradient(900px 700px at 50% 110%, rgba(2,6,23,0.95), rgba(2,6,23,1) 55%)",
            // copper “signal” sources
            "radial-gradient(550px 250px at 18% 18%, rgba(197,122,74,0.22), transparent 65%)",
            "radial-gradient(500px 240px at 80% 65%, rgba(197,122,74,0.14), transparent 70%)",
            // steel scanlines / texture
            "repeating-linear-gradient(0deg, rgba(255,255,255,0.04) 0px, rgba(255,255,255,0.00) 1px, rgba(0,0,0,0.10) 3px)",
            // subtle diagonal steel grain
            "repeating-linear-gradient(135deg, rgba(148,163,184,0.05) 0px, rgba(148,163,184,0.00) 6px, rgba(2,6,23,0.00) 14px)",
          ].join(", "),
          backgroundColor: "#020617",
        }}
      />

      {/* Top bar (ops header) */}
      <div className="sticky top-0 z-30 w-full border-b border-white/10 bg-black/35 backdrop-blur-xl">
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
                <div className="text-sm font-semibold text-white">ProFixIQ</div>
                <div className="flex items-center gap-2 text-[11px] text-neutral-400">
                  <span>Heavy-Duty &amp; Fleet Shop OS</span>
                  <span className="text-white/10">•</span>
                  <span className="inline-flex items-center gap-1">
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: "rgba(197,122,74,0.9)" }}
                    />
                    <span className="text-neutral-500">Signal</span>
                  </span>
                </div>
              </div>
            </Link>

            <div className="flex items-center gap-2">
              {/* Always visible portal entry */}
              <Link
                href="/portal"
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-1.5 text-sm font-extrabold text-neutral-100 transition hover:bg-neutral-900/40"
                style={{
                  boxShadow: "0 0 0 1px rgba(197,122,74,0.08) inset",
                }}
              >
                Portal Sign In
              </Link>

              <Link
                href="/portal/fleet"
                className="hidden sm:inline-flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-1.5 text-sm font-semibold text-neutral-200 transition hover:bg-neutral-900/40"
              >
                Fleet Portal
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
                    className="inline-flex rounded-xl px-3 py-1.5 text-sm font-extrabold text-black transition"
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
                  className="inline-flex rounded-xl border border-white/10 bg-black/15 px-3 py-1.5 text-sm font-semibold text-neutral-200 transition hover:bg-neutral-900/40"
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
              className="mt-2 text-3xl text-neutral-100 md:text-5xl"
              style={{ fontFamily: "var(--font-blackops)" }}
            >
              Everything included. One workflow.
            </h2>
            <p className="mt-3 text-sm text-neutral-300 md:text-base">
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
              className="mt-2 text-3xl text-neutral-100 md:text-5xl"
              style={{ fontFamily: "var(--font-blackops)" }}
            >
              Pricing that scales with your operation
            </h2>
            <p className="mt-3 text-sm text-neutral-300 md:text-base">
              Start with a free trial. Upgrade when you’re ready — no migration
              mess later.
            </p>
          </div>

          <div className="mt-10">
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
          <div className="mt-10 rounded-2xl border border-white/10 bg-black/20 px-6 py-6 backdrop-blur">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-lg font-extrabold text-white">
                  Ready to see it in motion?
                </div>
                <div className="mt-1 text-sm text-neutral-300">
                  Create a work order, run an inspection, or let AI scan your shop&apos;s history.
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  href="/work-orders/create"
                  className="rounded-xl px-4 py-2 text-sm font-extrabold text-black"
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
                  className="rounded-xl border border-white/10 bg-black/25 px-4 py-2 text-sm font-semibold text-neutral-200 transition hover:bg-neutral-900/40"
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