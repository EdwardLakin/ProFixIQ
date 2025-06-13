'use client';

import React from 'react';
import Link from 'next/link';

export default function ProFixIQLanding() {
  return (
    <div className="min-h-screen bg-surface text-accent px-6 py-12 flex flex-col items-center">
      <h1 className="text-5xl font-bold mb-4">ProFixIQ</h1>
      <p className="text-muted mb-10 text-center">AI-powered repair assistant for diagnostics, inspections, and workflow management.</p>

      <div className="grid sm:grid-cols-2 gap-6 mb-12 w-full max-w-4xl">
        <Link href="/ai">
          <div className="bg-card hover:bg-muted p-6 rounded-xl shadow-card transition">
            <h2 className="text-2xl font-semibold mb-2">🧠 AI Diagnostics</h2>
            <p className="text-muted-foreground">Use GPT-powered repair suggestions from DTCs or photos.</p>
          </div>
        </Link>

        <Link href="/work-orders">
          <div className="bg-card hover:bg-muted p-6 rounded-xl shadow-card transition">
            <h2 className="text-2xl font-semibold mb-2">🧾 Work Orders</h2>
            <p className="text-muted-foreground">Create and manage repair jobs with AI assistance.</p>
          </div>
        </Link>

        <Link href="/inspections">
          <div className="bg-card hover:bg-muted p-6 rounded-xl shadow-card transition">
            <h2 className="text-2xl font-semibold mb-2">✅ Inspections</h2>
            <p className="text-muted-foreground">Run and review inspections with voice & photo input.</p>
          </div>
        </Link>

        <Link href="/account">
          <div className="bg-card hover:bg-muted p-6 rounded-xl shadow-card transition">
            <h2 className="text-2xl font-semibold mb-2">👤 Account</h2>
            <p className="text-muted-foreground">Manage your plan, settings, and ProFixIQ preferences.</p>
          </div>
        </Link>
      </div>

      <div className="text-muted-foreground text-sm mt-auto">
        💡 Tip: Upgrade to Pro+ for voice-guided inspections and unlimited work orders.
      </div>
    </div>
  );
}