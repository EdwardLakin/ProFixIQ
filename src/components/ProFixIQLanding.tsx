'use client';

import Link from 'next/link';

export default function ProFixIQLanding() {
  return (
    <main className="max-w-xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-accent mb-4">👋 Welcome to ProFixIQ</h1>
      <p className="text-muted mb-8">
        AI-powered repair assistant for diagnostics, inspections, and workflow automation.
      </p>

      {/* AI Diagnosis */}
      <section className="mb-8 bg-surface p-4 rounded shadow-card">
        <h2 className="text-xl font-bold text-accent mb-2">🧠 AI Diagnosis</h2>
        <p className="text-muted mb-4">
          Use GPT-powered tools to troubleshoot vehicle issues, decode DTCs, and analyze photos.
        </p>
        <Link
          href="/ai"
          className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded text-center"
        >
          Open AI Diagnostic Tools
        </Link>
      </section>

      {/* Work Orders */}
      <section className="mb-8 bg-surface p-4 rounded shadow-card">
        <h2 className="text-xl font-bold text-accent mb-2">🧾 Work Orders</h2>
        <p className="text-muted mb-4">
          Create and manage repair jobs with AI-generated complaint, cause, correction, and labor time.
        </p>
        <Link
          href="/workorders"
          className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded text-center"
        >
          Manage Work Orders
        </Link>
      </section>

      {/* Inspections */}
      <section className="mb-8 bg-surface p-4 rounded shadow-card">
        <h2 className="text-xl font-bold text-accent mb-2">✅ Inspections</h2>
        <p className="text-muted mb-4">
          Perform structured inspections with fail/pass/good tracking, notes, photos, and auto-quoting.
        </p>
        <Link
          href="/inspections"
          className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded text-center"
        >
          Start or Review Inspections
        </Link>
      </section>

      {/* VIN Decoder */}
      <section className="mb-8 bg-surface p-4 rounded shadow-card">
        <h2 className="text-xl font-bold text-accent mb-2">🔍 VIN Decoder</h2>
        <p className="text-muted mb-4">
          Decode vehicle VINs to auto-fill year, make, model, and build info.
        </p>
        <Link
          href="/vin"
          className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded text-center"
        >
          Open VIN Decoder
        </Link>
      </section>

      {/* History */}
      <section className="mb-8 bg-surface p-4 rounded shadow-card">
        <h2 className="text-xl font-bold text-accent mb-2">📜 History</h2>
        <p className="text-muted mb-4">
          Review previous inspections, work orders, and AI sessions by vehicle.
        </p>
        <Link
          href="/history"
          className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded text-center"
        >
          View Repair History
        </Link>
      </section>

      {/* Bookings */}
      <section className="bg-surface p-4 rounded shadow-card">
        <h2 className="text-xl font-bold text-accent mb-2">📅 Bookings</h2>
        <p className="text-muted mb-4">
          Accept customer requests, confirm appointments, and display open tech availability.
        </p>
        <Link
          href="/booking"
          className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded text-center"
        >
          Manage Bookings
        </Link>
      </section>
    </main>
  );
}