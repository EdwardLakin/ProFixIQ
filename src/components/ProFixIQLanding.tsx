'use client';

import { useEffect, useState } from 'react';
import { Toaster } from 'sonner';

import Navbar from '@components/Navbar';
import LandingHero from '@components/ui/LandingHero';
import PlanComparison from 'app/landing/PlanComparison';
import LandingButtons from '@components/LandingButtons';
import SubscribeBanner from '@components/SubscribeBanner';
import Chatbot from '@components/Chatbot';

export default function ProFixLanding() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="relative font-header bg-gradient-to-b from-black via-neutral-900 to-black text-white overflow-hidden">
      <Toaster position="top-center" />
      <Navbar />

      <main className="relative z-10 pt-24 max-w-7xl mx-auto px-4">
        <LandingHero />
        <SubscribeBanner />

        <section id="features">
          <LandingButtons />
        </section>

        <section id="plans">
          <PlanComparison />
        </section>

        <section id="faq">
          <Chatbot />
        </section>
      </main>
    </div>
  );
}