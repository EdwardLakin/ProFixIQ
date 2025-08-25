"use client";

import { useEffect } from "react";
import { Toaster } from "sonner";

import LandingHero from "@shared/components/ui/LandingHero";
import FeaturesSection from "@shared/components/ui/FeaturesSection";
import WhySection from "@shared/components/ui/WhySection";
import PricingSection from "@shared/components/ui/PricingSection";
import Footer from "@shared/components/ui/Footer";
import Chatbot from "@ai/components/Chatbot";

// local type to satisfy PricingSection callback
type CheckoutPayload = {
  priceId: string;                  // Stripe price_...
  interval: "monthly" | "yearly";
};

export default function ProFixIQLanding() {
  // keep for client-only hydration if needed
  useEffect(() => {}, []);

  return (
    <div className="bg-black text-white">
      <Toaster position="top-center" />

      {/* 1) HERO */}
      <LandingHero />

      {/* 2) FEATURES (only one heading — keep it here) */}
      <section id="features" className="py-20">
        <div className="mx-auto max-w-6xl px-4">
          <h2
            className="text-center text-4xl text-orange-400"
            style={{ fontFamily: "var(--font-blackops)" }}
          >
            Powerful Features
          </h2>
          <p className="mt-2 text-center text-neutral-400">
            Have questions? Open the chatbot and ask anything about ProFixIQ.
          </p>

          <div className="mt-10">
            <FeaturesSection />
          </div>
        </div>
      </section>

      {/* 3) WHY (this component includes its own heading) */}
      <section id="why" className="bg-neutral-950 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <WhySection />
        </div>
      </section>

      {/* 4) PRICING */}
      <section id="plans" className="bg-neutral-900 py-20">
        <div className="mx-auto max-w-6xl px-4">
          <PricingSection
            onCheckout={async ({ priceId, interval }: CheckoutPayload) => {
              // Public checkout (no login required)
              const res = await fetch("/api/stripe/checkout", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  planKey: priceId, // Stripe price_*
                  interval,         // "monthly" | "yearly"
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
              if (data?.url) {
                window.location.href = data.url;
              } else {
                alert("No checkout URL returned");
              }
            }}
            onStartFree={() => {
              // Free → straight to onboarding (no auth needed)
              window.location.href = "/onboarding/profile";
            }}
          />
        </div>
      </section>

      {/* 5) Floating chatbot for marketing */}
      <Chatbot variant="marketing" />

      {/* 6) FOOTER */}
      <Footer />
    </div>
  );
}