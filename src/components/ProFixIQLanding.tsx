'use client'

import Link from 'next/link'

export default function ProFixIQLanding() {
  return (
    <main className="max-w-xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">ProFixIQ</h1>
      <p className="text-muted mb-6">
        AI-powered repair assistant for diagnostics, inspections, and workflow management.
      </p>

      {/* ✅ AI DIAGNOSIS */}
      <h2 className="text-xl font-bold text-accent mb-2">🧠 AI Diagnosis</h2>
      <p className="text-muted mb-4">Use GPT-powered tools to troubleshoot vehicle problems.</p>
      <Link
        href="/ai"
        className="block w-full bg-blue-600 text-white text-center py-3 rounded shadow text-lg font-semibold"
      >
        Open AI Diagnostic Tools
      </Link>

      {/* ✅ WORK ORDERS */}
      <h2 className="text-xl font-bold text-accent mt-8 mb-2">📋 Work Orders</h2>
      <p className="text-muted mb-4">Create and manage repair jobs with AI assistance.</p>
      <Link href="/workorders" className="underline text-blue-600">Manage Work Orders</Link>

      {/* ✅ INSPECTIONS */}
      <h2 className="text-xl font-bold text-accent mt-8 mb-2">✅ Inspections</h2>
      <p className="text-muted mb-4">Run and review inspections with voice & photo input.</p>
      <Link href="/inspections" className="underline text-blue-600">View Inspection Templates</Link>

      {/* ✅ BOOKINGS */}
      <h2 className="text-xl font-bold text-accent mt-8 mb-2">📅 Bookings</h2>
      <p className="text-muted mb-4">Request an appointment and get an estimate.</p>
      <Link href="/booking" className="underline text-blue-600">Start a Booking</Link>

      {/* ✅ ACCOUNT */}
      <h2 className="text-xl font-bold text-accent mt-8 mb-2">👤 Account</h2>
      <p className="text-muted mb-4">Manage your plan, settings, and ProFixIQ preferences.</p>
      <Link href="/dashboard/approvals" className="underline text-blue-600">Open Account Settings</Link>

      {/* ✅ UPGRADE TIP */}
      <p className="text-sm text-yellow-600 mt-6">
        💡 Tip: Upgrade to Pro+ for voice-guided inspections and unlimited work orders.
      </p>
    </main>
  )
}