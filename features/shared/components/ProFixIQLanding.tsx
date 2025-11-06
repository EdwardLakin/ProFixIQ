// features/landing/ProFixIQLanding.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Toaster } from "sonner";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

import LandingHero from "@shared/components/ui/LandingHero";
import FeaturesSection from "@shared/components/ui/FeaturesSection";
import WhySection from "@shared/components/ui/WhySection";
import PricingSection from "@shared/components/ui/PricingSection";
import Footer from "@shared/components/ui/Footer";
import Container from "@shared/components/ui/Container";
import LandingChatbot from "@/features/landing/LandingChatbot"; // ✅ use wrapper

type Interval = "monthly" | "yearly";

export default function ProFixIQLanding() {
  const supabase = createClientComponentClient<Database>();
  const [sessionExists, setSessionExists] = useState(false);

  // detect logged-in user
  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setSessionExists(!!session);

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, sess) => {
        setSessionExists(!!sess);
      });

      return () => {
        subscription.unsubscribe();
      };
    })();
  }, [supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setSessionExists(false);
    // optional: send them to landing root
    window.location.href = "/";
  };

  return (
    <div className="bg-black text-white">
      <Toaster position="top-center" />

      {/* Top bar */}
      <div className="w-full bg-neutral-950/60 border-b border-white/10">
        <Container>
          <div className="flex items-center justify-between py-3 gap-3">
            <Link
              href="/"
              className="text-orange-400 font-semibold tracking-wide"
            >
              ProFixIQ
            </Link>

            <div className="flex items-center gap-2">
              <Link
                href="/portal"
                className="inline-flex items-center gap-2 rounded-lg border border-orange-500/70 bg-black/30 px-3 py-1.5 text-sm font-semibold text-orange-400 hover:bg-orange-500 hover:text-black transition"
              >
                Customer Portal
              </Link>

              {sessionExists ? (
                <>
                  <Link
                    href="/dashboard"
                    className="hidden sm:inline-flex rounded-lg border border-white/10 px-3 py-1.5 text-sm text-neutral-200 hover:border-orange-400"
                  >
                    Dashboard
                  </Link>
                  <button
                    onClick={handleSignOut}
                    className="inline-flex rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-semibold text-black hover:bg-orange-600 transition"
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <Link
                  href="/sign-in"
                  className="inline-flex rounded-lg border border-white/10 px-3 py-1.5 text-sm text-neutral-200 hover:border-orange-400"
                >
                  Sign In
                </Link>
              )}
            </div>
          </div>
        </Container>
      </div>

      {/* 1) HERO */}
      <LandingHero />

      {/* 2) FEATURES */}
      <section id="features" className="py-20">
        <Container>
          <h2
            className="text-center text-4xl md:text-5xl text-orange-400 mb-10"
            style={{ fontFamily: "var(--font-blackops)" }}
          >
            Powerful Features
          </h2>

          <p className="text-center text-neutral-400 mb-10">
            Have questions? Open the chatbot and ask anything about ProFixIQ.
          </p>

          <FeaturesSection showHeading={false} />
        </Container>
      </section>

      {/* 3) WHY */}
      <section id="why" className="bg-neutral-950 py-20">
        <Container>
          <WhySection />
        </Container>
      </section>

      {/* 4) PRICING */}
      <section id="plans" className="bg-neutral-900 py-20">
        <Container>
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
                  interval,
                  isAddon: false,
                  shopId: null,
                  userId: null,
                }),
              });

              if (!res.ok) {
                alert("Checkout failed");
                return;
              }
              const data = await res.json();
              if (data?.url) window.location.href = data.url;
              else alert("No checkout URL returned");
            }}
            onStartFree={() => {
              window.location.href = "/onboarding/profile";
            }}
          />
        </Container>
      </section>

      {/* 5) Chatbot */}
      <LandingChatbot />

      {/* 6) Footer */}
      <Footer />
    </div>
  );
}