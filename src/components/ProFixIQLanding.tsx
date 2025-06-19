'use client';

import React from 'react';
import Navbar from '@/components/Navbar';
import Header from '@/components/ui/Header';
import SubscribeBanner from '@/components/SubscribeBanner';
import LandingButtons from '@/components/LandingButtons';

export default function ProFixIQLanding() {
  return (
    <div className="relative">
      {/* Sticky nav at top */}
      <Navbar />

      {/* Main content wrapper */}
      <div className="pt-24 max-w-7xl mx-auto px-6 py-12">
        {/* Hero title */}
        <Header
          title="Welcome to"
          highlight="ProFixIQ"
          subtitle="The AI-powered diagnostic platform built for pros and DIYers."
        />

        {/* Call-to-action banner */}
        <SubscribeBanner />

        {/* Feature tiles */}
        <LandingButtons />
      </div>
    </div>
  );
}