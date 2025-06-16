'use client';

import Link from 'next/link';

export default function ProFixIQLanding() {
  return (
    <main className="max-w-4xl mx-auto px-4 py-8 text-gray-800">
      <h1 className="text-4xl font-bold text-blue-600 text-center mb-2">Welcome to ProFixIQ</h1>
      <p className="text-center text-gray-600 text-lg mb-8">
        AI-powered repair assistant for diagnostics, inspections, and workflow management.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* AI Chat Assistant */}
        <Link href="/ai/chat">
          <div className="rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 shadow-md p-5 transition-colors">
            <h2 className="text-xl font-semibold text-blue-800 mb-1">🧠 AI Diagnosis</h2>
            <p className="text-gray-700">
              Use GPT-powered tools to troubleshoot vehicles, ask questions, and find issues.
            </p>
          </div>
        </Link>

        {/* Visual Diagnosis */}
        <Link href="/ai/photo">
          <div className="rounded-xl border border-orange-200 bg-orange-50 hover:bg-orange-100 shadow-md p-5 transition-colors">
            <h2 className="text-xl font-semibold text-orange-800 mb-1">📸 Visual Diagnosis</h2>
            <p className="text-gray-700">
              Upload photos to detect problems like leaks, rust, or worn parts.
            </p>
          </div>
        </Link>

        {/* Work Orders */}
        <Link href="/workorders">
          <div className="rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 shadow-md p-5 transition-colors">
            <h2 className="text-xl font-semibold text-blue-800 mb-1">🛠️ Work Orders</h2>
            <p className="text-gray-700">
              Create and manage repair jobs with AI-generated complaint, cause, and correction lines.
            </p>
          </div>
        </Link>

        {/* Inspections */}
        <Link href="/inspections">
          <div className="rounded-xl border border-orange-200 bg-orange-50 hover:bg-orange-100 shadow-md p-5 transition-colors">
            <h2 className="text-xl font-semibold text-orange-800 mb-1">🧾 Inspections</h2>
            <p className="text-gray-700">
              Run and review inspections with voice & photo capture (Pro+).
            </p>
          </div>
        </Link>

        {/* Bookings */}
        <Link href="/booking">
          <div className="rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100 shadow-md p-5 transition-colors">
            <h2 className="text-xl font-semibold text-blue-800 mb-1">📅 Bookings</h2>
            <p className="text-gray-700">
              Let customers request appointments and get instant AI-generated estimates.
            </p>
          </div>
        </Link>

        {/* Account / Approvals */}
        <Link href="/dashboard/approvals">
          <div className="rounded-xl border border-orange-200 bg-orange-50 hover:bg-orange-100 shadow-md p-5 transition-colors">
            <h2 className="text-xl font-semibold text-orange-800 mb-1">👤 Account</h2>
            <p className="text-gray-700">
              Manage your plan, settings, and approve repair quotes from techs.
            </p>
          </div>
        </Link>
      </div>

      {/* Upgrade Tip */}
      <div className="mt-8 text-sm text-center text-yellow-600 bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 shadow-sm">
        <strong>Tip:</strong> Upgrade to Pro+ for voice-guided inspections and unlimited work orders.
      </div>
    </main>
  );
}