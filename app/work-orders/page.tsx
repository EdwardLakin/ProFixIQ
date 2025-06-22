'use client';

import { withAuthAndPlan } from '@/lib/withAuthAndPlan';

function WorkOrdersPage() {
  return (
    <div className="min-h-screen px-4 py-10 bg-background text-white">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-blackops text-orange-500 text-center mb-8">
          Work Orders
        </h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <a
            href="/work-orders/create"
            className="bg-black/30 backdrop-blur-md border border-orange-500 rounded-xl p-6 shadow-card hover:bg-black/50 transition"
          >
            <h2 className="text-2xl font-blackops mb-1 text-white">Create Work Order</h2>
            <p className="text-neutral-300 text-sm">Enter customer and vehicle info, select inspections, and create concern lines.</p>
          </a>

          <a
            href="/work-orders/view"
            className="bg-black/30 backdrop-blur-md border border-orange-500 rounded-xl p-6 shadow-card hover:bg-black/50 transition"
          >
            <h2 className="text-2xl font-blackops mb-1 text-white">View Work Orders</h2>
            <p className="text-neutral-300 text-sm">Review submitted work orders and manage jobs.</p>
          </a>
        </div>
      </div>
    </div>
  );
}

export default withAuthAndPlan(WorkOrdersPage, ['Pro', 'Pro+']);