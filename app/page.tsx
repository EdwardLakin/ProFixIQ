// app/page.tsx
'use client'

import { useRouter } from 'next/navigation'
import React from 'react'

export default function Home() {
  const router = useRouter()

  return (
    <main className="flex flex-col items-center justify-center min-h-screen gap-8">
      {/* Banner */}
      <div className="w-full bg-gradient-to-r from-amber-500 to-yellow-400 text-black text-center py-2 font-bold rounded-md shadow-md">
        🚗 Sign up now for DIY, Pro, or Pro+ Plans!{' '}
        <button
          onClick={() => router.push('/plans')}
          className="underline ml-1 hover:text-white transition"
        >
          View Plans
        </button>
      </div>

      {/* Hero */}
      <div className="text-center space-y-4">
        <h1 className="text-5xl md:text-7xl font-black uppercase font-blackops">
          ProFixIQ
        </h1>
        <p className="text-lg md:text-xl text-gray-300">
          Diagnose vehicle issues with AI-powered precision
        </p>
      </div>

      {/* Buttons */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-4xl mt-8">
        <button
          onClick={() => router.push('/app/ai/dtc')}
          className="bg-white/10 border border-white/20 rounded-lg px-6 py-5 text-white text-xl font-blackops hover:bg-white/20 transition"
        >
          AI Diagnosis
        </button>
        <button className="bg-white/10 border border-white/20 rounded-lg px-6 py-5 text-white text-xl font-blackops hover:bg-white/20 transition">
          Visual Inspection
        </button>
        <button className="bg-white/10 border border-white/20 rounded-lg px-6 py-5 text-white text-xl font-blackops hover:bg-white/20 transition">
          TechBot
        </button>
        <button className="bg-white/10 border border-white/20 rounded-lg px-6 py-5 text-white text-xl font-blackops hover:bg-white/20 transition">
          Repair History
        </button>
        <button className="bg-white/10 border border-white/20 rounded-lg px-6 py-5 text-white text-xl font-blackops hover:bg-white/20 transition">
          Maintenance Tracker
        </button>
        <button className="bg-white/10 border border-white/20 rounded-lg px-6 py-5 text-white text-xl font-blackops hover:bg-white/20 transition">
          Community Help
        </button>
      </div>
    </main>
  )
}