'use client';

import React from 'react';
import PlanSelectionPage from '@components/onboarding/PlanSelectionPage';
import Link from 'next/link';

export default function SubscribePage() {
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Logo-only Navbar */}
      <header className="w-full fixed top-0 z-50 backdrop-blur-md bg-black/30 border-b border-orange-500">
        <nav className="max-w-7xl mx-auto px-6 py-4 flex justify-start items-center">
          <Link href="/">
            <h1 className="text-2xl font-blackops text-orange-500 tracking-wide">
              ProFixIQ
            </h1>
          </Link>
        </nav>
      </header>

      {/* Main Content */}
      <main className="pt-24 px-6 py-12">
        {/* Plan Card Layout */}
        <PlanSelectionPage />
      </main>
    </div>
  );
}