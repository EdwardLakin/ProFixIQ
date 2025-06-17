'use client'

import Link from 'next/link'

export default function ProFixIQLanding() {
  return (
    <main className="max-w-xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-accent mb-4 font-blackops">
        👋 Welcome to ProFixIQ
      </h1>
      <p className="text-muted mb-8">
        AI-powered repair assistant for diagnostics, inspections, and workflow automation.
      </p>

      {/* AI DIAGNOSIS */}
      <section className="mb-8 bg-surface p-4 rounded shadow-card">
        <h2 className="text-xl font-bold text-accent mb-2 font-blackops">
          🧠 AI Diagnosis
        </h2>
        <p className="text-muted mb-4">
          Use GPT-powered tools to troubleshoot vehicle issues, decode DTCs, and analyze photos.
        </p>
        <Link href="/ai">
          <button className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition">
            Open AI Diagnostic Tools
          </button>
        </Link>
      </section>

      {/* WORK ORDERS */}
      <section className="mb-8 bg-surface p-4 rounded shadow-card">
        <h2 className="text-xl font-bold text-accent mb-2 font-blackops">
          🧾 Work Orders
        </h2>
        <p className="text-muted mb-4">
          Create and manage repair jobs with AI-generated complaint, cause, correction, and labor time.
        </p>
        <Link href="/workorders">
          <button className="bg-orange-500 text-white px-4 py-2 rounded hover:bg-orange-600 transition">
            Manage Work Orders
          </button>
        </Link>
      </section>

      {/* INSPECTIONS */}
      <section className="mb-8 bg-surface p-4 rounded shadow-card">
        <h2 className="text-xl font-bold text-accent mb-2 font-blackops">
          ✅ Inspections
        </h2>
        <p className="text-muted mb-4">
          Perform structured inspections with fail/pass/good tracking, notes, photos, and auto-quoting.
        </p>
        <Link href="/inspections">
          <button className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition">
            Start or Review Inspections
          </button>
        </Link>
      </section>

      {/* VIN DECODER */}
      <section className="mb-8 bg-surface p-4 rounded shadow-card">
        <h2 className="text-xl font-bold text-accent mb-2 font-blackops">
          🆔 VIN Decoder
        </h2>
        <p className="text-muted mb-4">
          Decode vehicle VINs to auto-fill year, make, model, and build info.
        </p>
        <Link href="/vin">
          <button className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition">
            Open VIN Decoder
          </button>
        </Link>
      </section>

      {/* HISTORY */}
      <section className="mb-8 bg-surface p-4 rounded shadow-card">
        <h2 className="text-xl font-bold text-accent mb-2 font-blackops">
          📜 History
        </h2>
        <p className="text-muted mb-4">
          Review previous inspections, work orders, and AI sessions by vehicle.
        </p>
        <Link href="/history">
          <button className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition">
            View Repair History
          </button>
        </Link>
      </section>

      {/* BOOKINGS */}
      <section className="mb-8 bg-surface p-4 rounded shadow-card">
        <h2 className="text-xl font-bold text-accent mb-2 font-blackops">
          📅 Bookings
        </h2>
        <p className="text-muted mb-4">
          Accept customer requests, confirm appointments, and display open tech availability.
        </p>
        <Link href="/booking">
          <button className="bg-orange-500 text-white px-4 py-2 rounded hover:bg-orange-600 transition">
            Manage Bookings
          </button>
        </Link>
      </section>
    </main>
  )
}