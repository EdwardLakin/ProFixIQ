'use client';

import Link from 'next/link';

export default function WorkOrderMenuPage() {
  return (
    <div className="min-h-screen p-6 flex flex-col items-center justify-start">
      <h1 className="text-3xl font-blackops text-orange-400 mb-8 text-center">
        Work Order Menu
      </h1>

      <div className="grid gap-6 w-full max-w-md">
        <Link
          href="/work-orders/create"
          className="block text-center border border-orange-500 text-orange-400 px-6 py-4 rounded-md hover:bg-orange-500 hover:text-black font-semibold transition"
        >
          Create New Work Order
        </Link>

        <Link
          href="/work-orders/queue"
          className="block text-center border border-orange-500 text-orange-400 px-6 py-4 rounded-md hover:bg-orange-500 hover:text-black font-semibold transition"
        >
          View Job Queue
        </Link>
      </div>
    </div>
  );
}