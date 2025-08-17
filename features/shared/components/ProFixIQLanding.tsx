"use client";

import { useEffect, useState } from "react";
import { Toaster } from "sonner";

import LandingHero from "@shared/components/ui/LandingHero";
import Chatbot from "@ai/components/Chatbot";
import Section from "@shared/components/ui/Section";

export default function ProFixLanding() {
  const [, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="relative font-header bg-gradient-to-b from-black via-neutral-900 to-black text-white">
      <Toaster position="top-center" />

      {/* layout.tsx already provides the global header */}
      <main className="relative z-10 pt-16 max-w-7xl mx-auto px-4">
        <LandingHero />

        <Section id="faq">
          <Chatbot />
        </Section>
      </main>
    </div>
  );
}