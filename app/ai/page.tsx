'use client';

import Link from 'next/link';

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
            className="block p-4 rounded bg-surface shadow-card border hover:bg-blue-50 transition"
          >
            <h2 className="text-lg font-semibold text-blue-700">📷 Analyze Image</h2>
            <p className="text-sm text-muted">
              Upload or capture a photo to identify visible issues using GPT-4o Vision.
            </p>
          </Link>
        </li>

        <li>
          <Link
            href="/ai/dtc"
            className="block p-4 rounded bg-surface shadow-card border hover:bg-blue-50 transition"
          >
            <h2 className="text-lg font-semibold text-orange-600">⚠️ DTC Code Lookup</h2>
            <p className="text-sm text-muted">
              Enter a diagnostic trouble code (e.g., P0171) to get an explanation and fix.
            </p>
          </Link>
        </li>

        <li>
          <Link
            href="/ai/chat"
            className="block p-4 rounded bg-surface shadow-card border hover:bg-blue-50 transition"
          >
            <h2 className="text-lg font-semibold text-pink-700">🧰 TechBot Assistant</h2>
            <p className="text-sm text-muted">
              Ask the AI mechanic about symptoms, repairs, or next steps using freeform chat.
            </p>
          </Link>
        </li>
      </ul>
    </div>
  );
}