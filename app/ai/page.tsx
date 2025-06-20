'use client';

import { useRouter } from 'next/navigation';

export default function AIDiagnosisPage() {
  const router = useRouter();

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      {/* Heading */}
      <div className="mb-12 text-center">
        <h1 className="text-7xl sm:text-8xl font-blackops text-orange-500 drop-shadow-lg">
          AI Diagnosis
        </h1>
        <p className="mt-4 text-lg text-neutral-300">
          Select a diagnostic method below to begin:
        </p>
      </div>

      {/* Diagnostic Options */}
      <div className="space-y-6">
        {/* Analyze Image */}
        <button
          onClick={() => router.push('/ai/photo')}
          className="w-full py-5 px-6 border-4 border-blue-400 text-blue-400 font-blackops text-2xl rounded-xl bg-black bg-opacity-30 hover:scale-105 transition-all duration-200"
        >
          Analyze Image
          <p className="mt-2 text-sm font-normal text-white">
            Upload or capture a photo to identify visible issues using GPT-4o Vision.
          </p>
        </button>

        {/* DTC Code Lookup */}
        <button
          onClick={() => router.push('/ai/dtc')}
          className="w-full py-5 px-6 border-4 border-yellow-400 text-yellow-400 font-blackops text-2xl rounded-xl bg-black bg-opacity-30 hover:scale-105 transition-all duration-200"
        >
          DTC Code Lookup
          <p className="mt-2 text-sm font-normal text-white">
            Enter a trouble code (e.g., P0171) to get an explanation and fix.
          </p>
        </button>

        {/* TechBot */}
        <button
          onClick={() => router.push('/ai/chat')}
          className="w-full py-5 px-6 border-4 border-green-400 text-green-400 font-blackops text-2xl rounded-xl bg-black bg-opacity-30 hover:scale-105 transition-all duration-200"
        >
          TechBot Assistant
          <p className="mt-2 text-sm font-normal text-white">
            Ask the AI mechanic about symptoms, repairs, or next steps using freeform chat.
          </p>
        </button>
      </div>
    </div>
  );
}