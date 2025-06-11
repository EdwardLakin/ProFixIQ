// components/ProFixIQLanding.tsx
'use client';

import React from 'react';
import Link from 'next/link';

export default function ProFixIQLanding() {
  return (
    <div className="min-h-screen bg-surface text-accent px-6 py-12 flex flex-col items-center">
      <div className="max-w-4xl w-full text-center">
        <h1 className="text-5xl font-bold mb-4">ProFixIQ</h1>
        <p className="text-lg text-muted mb-10">
          Your AI-powered repair assistant for diagnostics, inspections, and workflow management.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-12">
          <Link
            href="/ai"
            className="bg-card hover:bg-muted rounded-xl p-6 shadow-card transition-colors text-left"
          >
            <h2 className="text-2xl font-semibold mb-2">🧠 AI Diagnostics</h2>
            <p className="text-sm text-muted-foreground">Get repair suggestions from images or DTC codes.</p>
          </Link>

          <Link
            href="/work-orders"
            className="bg-card hover:bg-muted rounded-xl p-6 shadow-card transition-colors text-left"
          >
            <h2 className="text-2xl font-semibold mb-2">📝 Work Orders</h2>
            <p className="text-sm text-muted-foreground">Create and manage repair jobs with AI assistance.</p>
          </Link>

          <Link
            href="/inspections"
            className="bg-card hover:bg-muted rounded-xl p-6 shadow-card transition-colors text-left"
          >
            <h2 className="text-2xl font-semibold mb-2">✅ Inspections</h2>
            <p className="text-sm text-muted-foreground">Run and review inspections with voice & photo input.</p>
          </Link>

          <Link
            href="/account"
            className="bg-card hover:bg-muted rounded-xl p-6 shadow-card transition-colors text-left"
          >
            <h2 className="text-2xl font-semibold mb-2">⚙️ Account</h2>
            <p className="text-sm text-muted-foreground">Manage your plan, settings, and ProFixIQ preferences.</p>
          </Link>
        </div>

        <div className="text-sm text-muted-foreground">
          💡 Tip: Upgrade to Pro+ for voice-guided inspections and unlimited work orders.
        </div>
      </div>
    </div>
  );
}