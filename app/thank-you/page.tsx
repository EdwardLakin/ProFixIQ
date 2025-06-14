'use client';

import Link from 'next/link';

export default function ThankYouPage() {
  return (
    <div className="p-6 text-center">
      <h1 className="text-2xl font-bold text-green-600 mb-4">✅ Booking Confirmed</h1>
      <p className="mb-6 text-gray-700">
        Your appointment request has been submitted successfully.
      </p>
      <Link href="/" className="bg-accent text-white px-4 py-2 rounded shadow">
        Return to Home
      </Link>
    </div>
  );
}