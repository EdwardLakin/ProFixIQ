'use client';

import Link from 'next/link';

export default function ProFixIQLanding() {
  return (
    <main className="max-w-xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-accent mb-4">🚗 Welcome to ProFixIQ</h1>
      <p className="text-muted mb-8">
        AI-powered repair assistant for diagnostics, inspections, and workflow management.
      </p>

      {/* AI DIAGNOSIS */}
      <section className="mb-8 bg-surface p-4 rounded shadow-card">
        <h2 className="text-xl font-bold text-accent mb-2">🧠 AI Diagnosis</h2>
        <p className="text-muted mb-4">
          Use GPT-powered tools to troubleshoot vehicles, ask questions, and find issues.
        </p>
        <Link
          href="/ai"
          className="block w-full bg-blue-600 hover:bg-blue-700 text-white text-center py-2 rounded font-semibold"
        >
          Open AI Diagnostic Tools
        </Link>
      </section>

      {/* WORK ORDERS */}
      <section className="mb-8 bg-surface p-4 rounded shadow-card">
        <h2 className="text-xl font-bold text-accent mb-2">🧾 Work Orders</h2>
        <p className="text-muted mb-4">
          Create and manage repair jobs with AI-generated complaint, cause, and correction lines.
        </p>
        <Link
          href="/workorders"
          className="underline text-blue-600 hover:text-blue-800"
        >
          Manage Work Orders
        </Link>
      </section>

      {/* INSPECTIONS */}
      <section className="mb-8 bg-surface p-4 rounded shadow-card">
        <h2 className="text-xl font-bold text-accent mb-2">🔍 Inspections</h2>
        <p className="text-muted mb-4">
          Run and review inspections with voice & photo capture (Pro+).
        </p>
        <Link
          href="/inspections"
          className="underline text-blue-600 hover:text-blue-800"
        >
          Start an Inspection
        </Link>
      </section>

      {/* BOOKINGS */}
      <section className="mb-8 bg-surface p-4 rounded shadow-card">
        <h2 className="text-xl font-bold text-accent mb-2">📆 Bookings</h2>
        <p className="text-muted mb-4">
          Let customers request appointments and get instant AI-generated estimates.
        </p>
        <Link
          href="/booking"
          className="underline text-blue-600 hover:text-blue-800"
        >
          Start a Booking
        </Link>
      </section>

      {/* ACCOUNT */}
      <section className="mb-8 bg-surface p-4 rounded shadow-card">
        <h2 className="text-xl font-bold text-accent mb-2">👤 Account</h2>
        <p className="text-muted mb-4">
          Manage your plan, settings, and ProFixIQ preferences.
        </p>
        <Link
          href="/dashboard/approvals"
          className="underline text-blue-600 hover:text-blue-800"
        >
          Open Account Panel
        </Link>
      </section>

      {/* TIP */}
      <div className="text-sm text-yellow-600 mt-6">
        💡 Tip: Upgrade to Pro+ for voice-guided inspections and unlimited work orders.
      </div>
    </main>
  );
}