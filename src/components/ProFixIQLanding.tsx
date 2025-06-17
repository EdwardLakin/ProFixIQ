'use client'

import Link from 'next/link'
import Button from './ui/Button'

export default function ProFixIQLanding() {
  return (
    <main className="max-w-xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-accent mb-4">👋 Welcome to ProFixIQ</h1>
      <p className="text-muted mb-8">
        AI-powered repair assistant for diagnostics, inspections, and workflow automation.
      </p>

      {/* AI DIAGNOSIS */}
      <section className="mb-8 bg-surface p-4 rounded shadow-card">
        <h2 className="text-xl font-bold text-accent mb-2">🧠 AI Diagnosis</h2>
        <p className="text-muted mb-4">
          Use GPT-powered tools to troubleshoot vehicle issues, decode DTCs, and analyze photos.
        </p>
        <Link href="/ai">
          <Button>Open AI Diagnostic Tools</Button>
        </Link>
      </section>

      {/* WORK ORDERS */}
      <section className="mb-8 bg-surface p-4 rounded shadow-card">
        <h2 className="text-xl font-bold text-accent mb-2">🧾 Work Orders</h2>
        <p className="text-muted mb-4">
          Create and manage repair jobs with AI-generated complaint, cause, correction, and labor time.
        </p>
        <Link href="/workorders">
          <Button>Manage Work Orders</Button>
        </Link>
      </section>

      {/* INSPECTIONS */}
      <section className="mb-8 bg-surface p-4 rounded shadow-card">
        <h2 className="text-xl font-bold text-accent mb-2">✅ Inspections</h2>
        <p className="text-muted mb-4">
          Perform structured inspections with fail/pass/good tracking, notes, photos, and auto-quoting.
        </p>
        <Link href="/inspections">
          <Button>Start or Review Inspections</Button>
        </Link>
      </section>

      {/* VIN DECODER */}
      <section className="mb-8 bg-surface p-4 rounded shadow-card">
        <h2 className="text-xl font-bold text-accent mb-2">🔍 VIN Decoder</h2>
        <p className="text-muted mb-4">
          Decode vehicle VINs to auto-fill year, make, model, and build info.
        </p>
        <Link href="/vin">
          <Button>Open VIN Decoder</Button>
        </Link>
      </section>

      {/* HISTORY */}
      <section className="mb-8 bg-surface p-4 rounded shadow-card">
        <h2 className="text-xl font-bold text-accent mb-2">📖 History</h2>
        <p className="text-muted mb-4">
          Review previous inspections, work orders, and AI sessions by vehicle.
        </p>
        <Link href="/history">
          <Button>View Repair History</Button>
        </Link>
      </section>

      {/* BOOKINGS */}
      <section className="mb-8 bg-surface p-4 rounded shadow-card">
        <h2 className="text-xl font-bold text-accent mb-2">📅 Bookings</h2>
        <p className="text-muted mb-4">
          Accept customer requests, confirm appointments, and display open tech availability.
        </p>
        <Link href="/booking">
          <Button>Manage Bookings</Button>
        </Link>
      </section>
    </main>
  )
}