// app/booking/confirmation/page.tsx

'use client'

import Link from 'next/link'

export default function BookingConfirmationPage() {
  return (
    <div className="max-w-xl mx-auto px-4 py-10 text-center">
      <h1 className="text-2xl font-bold text-accent mb-4">Booking Received ✅</h1>
      <p className="text-muted mb-6">
        Thanks for submitting your request! A technician will review and confirm availability shortly.
      </p>

      <div className="flex justify-center">
        <Link
          href="/"
          className="bg-accent text-white px-6 py-3 rounded shadow-card hover:bg-accent/80 transition"
        >
          Return to Home
        </Link>
      </div>
    </div>
  )
}