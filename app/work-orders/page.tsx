'use client';

import HomeButton from '@components/ui/HomeButton';
import Link from 'next/link';
import { withAuthAndPlan } from '@lib/withAuthAndPlan';

function WorkOrdersPageContent() {
  return (
    <div className="min-h-screen bg-black bg-opacity-90 text-white px-4 pt-6">
      <HomeButton />

      <h1 className="text-4xl font-black text-center text-orange-400 mb-6">
        Work Orders
      </h1>
      <p className="text-lg text-center text-neutral-300 mb-10">
        Select an option to begin
      </p>

      <div className="grid grid-cols-1 gap-6 max-w-2xl mx-auto">
        <Link href="/work-orders/create">
          <button className="w-full py-6 text-xl font-bold border border-orange-400 text-orange-400 hover:bg-orange-500 hover:text-black transition-all duration-200 rounded-md">
            Create Work Order
          </button>
        </Link>

        <Link href="/work-orders/customer">
          <button className="w-full py-6 text-xl font-bold border border-blue-400 text-blue-400 hover:bg-blue-500 hover:text-black transition-all duration-200 rounded-md">
            Customer Work Order
          </button>
        </Link>

        <Link href="/work-orders/quote-review">
          <button className="w-full py-6 text-xl font-bold border border-green-400 text-green-400 hover:bg-green-500 hover:text-black transition-all duration-200 rounded-md">
            Quote Review
          </button>
        </Link>
      </div>
    </div>
  );
}

export default function WorkOrdersPage() {
  return (
    <WithAuthAndPlan>
      <WorkOrdersPageContent />
    </WithAuthAndPlan>
  );
}