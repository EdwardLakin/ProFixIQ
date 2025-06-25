'use client';

import { useRouter } from 'next/navigation';
import HomeButton from '@components/ui/HomeButton';

export default function AIDiagnosisPage() {
  const router = useRouter();

  return (
    <div className="max-w-4xl mx-auto px-4 py-10">
      <HomeButton />

      {/* Heading */}
      <h1 className="text-7xl mb-2 text-center font-blackops text-orange-500 drop-shadow">
        AI Diagnosis
      </h1>
      <p className="text-lg text-center text-neutral-300">
        Select a diagnostic method below to begin:
      </p>

      {/* Diagnostic Options */}
      <div className="space-y-6 mt-8">
        {/* Analyze Image */}
        <button
          onClick={() => router.push('/ai/photo')}
          className="w-full py-5 px-6 border-4 border-blue-400 text-blue-400 font-bold text-lg rounded transition-all hover:scale-105"
        >
          <p className="text-2xl">Analyze Image</p>
          <p className="text-sm font-normal text-white">
            Upload or capture a photo to identify visible issues using GPT-4o Vision.
          </p>
        </button>

        {/* DTC Code Lookup */}
        <button
          onClick={() => router.push('/ai/dtc')}
          className="w-full py-5 px-6 border-4 border-yellow-400 text-yellow-400 font-bold text-lg rounded transition-all hover:scale-105"
        >
          <p className="text-2xl">DTC Code Lookup</p>
          <p className="text-sm font-normal text-white">
            Enter a trouble code (e.g., P0171) to get an explanation and fix.
          </p>
        </button>

        {/* TechBot */}
        <button
          onClick={() => router.push('/ai/chat')}
          className="w-full py-5 px-6 border-4 border-green-400 text-green-400 font-bold text-lg rounded transition-all hover:scale-105"
        >
          <p className="text-2xl">TechBot Assistant</p>
          <p className="text-sm font-normal text-white">
            Ask the AI mechanic about symptoms, repairs, or next steps using freeform chat.
          </p>
        </button>
      </div>
    </div>
  );
}