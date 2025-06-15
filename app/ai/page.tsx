'use client'

import Link from 'next/link'

export default function AIDiagnosisMenuPage() {
  return (
    <div className="max-w-xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-accent mb-4">🧠 AI Diagnosis</h1>
      <p className="text-muted mb-6">
        Select a diagnostic method below to begin:
      </p>

      <ul className="space-y-4">
        <li>
          <Link
            href="/ai/photo"
            className="block p-4 rounded bg-surface shadow-card hover:bg-gray-100 transition"
          >
            <h2 className="text-lg font-semibold">📷 Analyze Image</h2>
            <p className="text-sm text-muted">
              Upload or capture a photo to identify visible vehicle issues using GPT-4o vision.
            </p>
          </Link>
        </li>

        <li>
          <Link
            href="/ai/dtc"
            className="block p-4 rounded bg-surface shadow-card hover:bg-gray-100 transition"
          >
            <h2 className="text-lg font-semibold">🧾 DTC Code Lookup</h2>
            <p className="text-sm text-muted">
              Enter a diagnostic trouble code (e.g. P0171) to get an explanation and repair advice.
            </p>
          </Link>
        </li>

        <li>
          <Link
            href="/ai/chat"
            className="block p-4 rounded bg-surface shadow-card hover:bg-gray-100 transition"
          >
            <h2 className="text-lg font-semibold">💬 TechBot Assistant</h2>
            <p className="text-sm text-muted">
              Ask the AI mechanic about symptoms, repairs, or next steps using freeform text.
            </p>
          </Link>
        </li>
      </ul>
    </div>
  )
}