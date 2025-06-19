'use client';

import Link from 'next/link';

export default function AIDiagnosisMenuPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-12 text-center">
      <h1 className="text-4xl font-header text-orange-500 drop-shadow-sm mb-4">
        <span className="mr-2">🧠</span>AI Diagnosis
      </h1>
      <p className="text-neutral-300 mb-10 text-lg">
        Select a diagnostic method below to begin:
      </p>

      <div className="grid gap-6">
        <Link href="/ai/photo">
          <div className="bg-black bg-opacity-40 backdrop-blur-md border border-orange-500 rounded-lg p-6 hover:scale-[1.02] transition transform duration-200 shadow-glow cursor-pointer">
            <h2 className="text-2xl font-header text-blue-400 mb-2">📷 Analyze Image</h2>
            <p className="text-neutral-300 text-sm">
              Upload or capture a photo to identify visible issues using GPT-4o Vision.
            </p>
          </div>
        </Link>

        <Link href="/ai/dtc">
          <div className="bg-black bg-opacity-40 backdrop-blur-md border border-orange-500 rounded-lg p-6 hover:scale-[1.02] transition transform duration-200 shadow-glow cursor-pointer">
            <h2 className="text-2xl font-header text-orange-400 mb-2">⚠️ DTC Code Lookup</h2>
            <p className="text-neutral-300 text-sm">
              Enter a diagnostic trouble code (e.g., P0171) to get an explanation and fix.
            </p>
          </div>
        </Link>

        <Link href="/ai/chat">
          <div className="bg-black bg-opacity-40 backdrop-blur-md border border-orange-500 rounded-lg p-6 hover:scale-[1.02] transition transform duration-200 shadow-glow cursor-pointer">
            <h2 className="text-2xl font-header text-pink-500 mb-2">🧰 TechBot Assistant</h2>
            <p className="text-neutral-300 text-sm">
              Ask the AI mechanic about symptoms, repairs, or next steps using freeform chat.
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}