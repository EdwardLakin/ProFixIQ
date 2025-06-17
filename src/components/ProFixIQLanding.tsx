'use client';

import Link from 'next/link';
import { useEffect } from 'react';

export default function ProFixIQLanding() {
  useEffect(() => {
    document.body.style.background =
      'linear-gradient(to bottom right, #0f172a, #1e3a8a)'; // Dark to blue gradient
    document.body.style.backgroundImage +=
      ', url("/carbon-weave.png")'; // Make sure this file exists in /public
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundRepeat = 'repeat';
  }, []);

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-8 text-white font-sans space-y-6">
      <h1 className="text-4xl md:text-5xl font-black font-header tracking-wide text-orange-400 mb-6">
        Welcome to ProFixIQ
      </h1>

      <section className="w-full max-w-xl flex flex-col space-y-4">
        <Link
          href="/ai"
          className="w-full bg-orange-500 hover:bg-orange-600 text-white py-4 px-6 rounded-xl text-left transition-all shadow-md"
        >
          <div>
            <div className="text-xl font-bold font-header">AI Diagnosis</div>
            <div className="text-sm text-white font-light">
              Snap a photo or enter a code to get AI repair help.
            </div>
          </div>
        </Link>

        <Link
          href="/workorders"
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 px-6 rounded-xl text-left transition-all shadow-md"
        >
          <div>
            <div className="text-xl font-bold font-header">Work Orders</div>
            <div className="text-sm text-white font-light">
              Create, track, and manage repair work orders.
            </div>
          </div>
        </Link>

        <Link
          href="/inspections"
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 px-6 rounded-xl text-left transition-all shadow-md"
        >
          <div>
            <div className="text-xl font-bold font-header">Inspections</div>
            <div className="text-sm text-white font-light">
              Start or review vehicle inspections and reports.
            </div>
          </div>
        </Link>

        <Link
          href="/vin"
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 px-6 rounded-xl text-left transition-all shadow-md"
        >
          <div>
            <div className="text-xl font-bold font-header">VIN Decoder</div>
            <div className="text-sm text-white font-light">
              Decode VINs and auto-fill vehicle data.
            </div>
          </div>
        </Link>

        <Link
          href="/history"
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 px-6 rounded-xl text-left transition-all shadow-md"
        >
          <div>
            <div className="text-xl font-bold font-header">Repair History</div>
            <div className="text-sm text-white font-light">
              View previous diagnostics, repairs, and visits.
            </div>
          </div>
        </Link>

        <Link
          href="/booking"
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 px-6 rounded-xl text-left transition-all shadow-md"
        >
          <div>
            <div className="text-xl font-bold font-header">Customer Booking</div>
            <div className="text-sm text-white font-light">
              Customers can request appointments or quotes.
            </div>
          </div>
        </Link>
      </section>
    </main>
  );
}