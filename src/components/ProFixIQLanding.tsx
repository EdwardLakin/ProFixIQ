'use client'

import Link from 'next/link'

export default function ProFixIQLanding() {
  return (
    <main className="min-h-screen bg-white p-6">
      <h1 className="text-4xl header-font text-accent mb-8 text-center">ProFixIQ</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-3xl mx-auto">
        <Link href="/ai">
          <div className="header-font text-xl bg-primary text-white rounded-lg p-6 shadow-lg text-center hover:bg-orange-600 transition-all">
            AI Diagnosis
          </div>
        </Link>

        <Link href="/workorders">
          <div className="header-font text-xl bg-primary text-white rounded-lg p-6 shadow-lg text-center hover:bg-orange-600 transition-all">
            Work Orders
          </div>
        </Link>

        <Link href="/inspections">
          <div className="header-font text-xl bg-primary text-white rounded-lg p-6 shadow-lg text-center hover:bg-orange-600 transition-all">
            Inspections
          </div>
        </Link>

        <Link href="/vin">
          <div className="header-font text-xl bg-primary text-white rounded-lg p-6 shadow-lg text-center hover:bg-orange-600 transition-all">
            VIN Decoder
          </div>
        </Link>

        <Link href="/history">
          <div className="header-font text-xl bg-primary text-white rounded-lg p-6 shadow-lg text-center hover:bg-orange-600 transition-all">
            Repair History
          </div>
        </Link>

        <Link href="/booking">
          <div className="header-font text-xl bg-primary text-white rounded-lg p-6 shadow-lg text-center hover:bg-orange-600 transition-all">
            Booking
          </div>
        </Link>
      </div>
    </main>
  )
}