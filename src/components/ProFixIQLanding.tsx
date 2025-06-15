// app/page.tsx
"use client";

import Link from "next/link";

export default function Home() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">ProFixIQ</h1>
      <p className="text-muted mb-6">
        AI-powered repair assistant for diagnostics, inspections, and workflow
        management.
      </p>

      <h2 className="text-xl font-bold text-accent mb-2">🤖 AI Diagnostics</h2>
      <p className="text-muted mb-4">
        <Link href="/ai/dtc" className="underline text-blue-600">
          Use GPT-powered repair suggestions from DTCs or photos.
        </Link>
      </p>

      <h2 className="text-xl font-bold text-accent mb-2">🧾 Work Orders</h2>
      <p className="text-muted mb-4">
        <Link href="/workorders" className="underline text-blue-600">
          Create and manage repair jobs with AI assistance.
        </Link>
      </p>

      <h2 className="text-xl font-bold text-accent mb-2">✅ Inspections</h2>
      <p className="text-muted mb-4">
        <Link href="/inspections" className="underline text-blue-600">
          Run and review inspections with voice & photo input.
        </Link>
      </p>

      <h2 className="text-xl font-bold text-accent mb-2">📅 Bookings</h2>
      <p className="text-muted mb-4">
        <Link href="/booking" className="underline text-blue-600">
          Request an appointment and get an estimate.
        </Link>
      </p>

      <h2 className="text-xl font-bold text-accent mb-2">👤 Account</h2>
      <p className="text-muted mb-4">
        <Link href="/dashboard/approvals" className="underline text-blue-600">
          Manage your plan, settings, and ProFixIQ preferences.
        </Link>
      </p>

      <p className="text-sm text-yellow-600 mt-6">
        💡 Tip: Upgrade to Pro+ for voice-guided inspections and unlimited work
        orders.
      </p>
    </main>
  );
}
