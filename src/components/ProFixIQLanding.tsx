'use client'

import Link from 'next/link'

export default function ProFixIQLanding() {
  return (
    <main className="max-w-xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-blackops mb-4 flex items-center gap-2">
        <span role="img" aria-label="wave">👋</span> Welcome to ProFixIQ
      </h1>
      <p className="text-muted mb-8">
        AI-powered repair assistant for diagnostics, inspections, and workflow automation.
      </p>

      {/* === AI Diagnosis === */}
      <section className="card mb-6">
        <h2 className="text-2xl font-blackops flex items-center gap-2 mb-2">
          <span role="img" aria-label="ai">🧠</span> AI Diagnosis
        </h2>
        <p className="text-muted mb-2">
          Use GPT-powered tools to troubleshoot vehicle issues, decode DTCs, and analyze photos.
        </p>
        <Link href="/ai">
          <button className="button-primary">Open AI Diagnostic Tools</button>
        </Link>
      </section>

      {/* === Work Orders === */}
      <section className="card mb-6">
        <h2 className="text-2xl font-blackops flex items-center gap-2 mb-2">
          <span role="img" aria-label="clipboard">📋</span> Work Orders
        </h2>
        <p className="text-muted mb-2">
          Create and manage repair jobs with AI-generated complaint, cause, correction, and labor time.
        </p>
        <Link href="/workorders">
          <button className="button-primary">Manage Work Orders</button>
        </Link>
      </section>

      {/* === Inspections === */}
      <section className="card mb-6">
        <h2 className="text-2xl font-blackops flex items-center gap-2 mb-2">
          <span role="img" aria-label="inspection">✅</span> Inspections
        </h2>
        <p className="text-muted mb-2">
          Perform structured inspections with pass/fail tracking, notes, photos, and auto-quoting.
        </p>
        <Link href="/inspections">
          <button className="button-primary">Start or Review Inspections</button>
        </Link>
      </section>

      {/* === VIN Decoder === */}
      <section className="card mb-6">
        <h2 className="text-2xl font-blackops flex items-center gap-2 mb-2">
          <span role="img" aria-label="vin">🆔</span> VIN Decoder
        </h2>
        <p className="text-muted mb-2">
          Decode vehicle VINs to auto-fill year, make, model, and build info.
        </p>
        <Link href="/vin">
          <button className="button-primary">Open VIN Decoder</button>
        </Link>
      </section>

      {/* === History === */}
      <section className="card mb-6">
        <h2 className="text-2xl font-blackops flex items-center gap-2 mb-2">
          <span role="img" aria-label="history">📅</span> History
        </h2>
        <p className="text-muted mb-2">
          Review previous inspections, work orders, and AI sessions by vehicle.
        </p>
        <Link href="/history">
          <button className="button-secondary">View Repair History</button>
        </Link>
      </section>

      {/* === Bookings === */}
      <section className="card mb-6">
        <h2 className="text-2xl font-blackops flex items-center gap-2 mb-2">
          <span role="img" aria-label="calendar">📆</span> Bookings
        </h2>
        <p className="text-muted mb-2">
          Accept customer requests, confirm appointments, and view open slots.
        </p>
        <Link href="/booking">
          <button className="button-secondary">Manage Bookings</button>
        </Link>
      </section>
    </main>
  )
}