"use client";

import React from "react";

export default function BillingClient() {
  // TODO: wire to your billing provider or Supabase tables (subscriptions, invoices)
  // Example shape:
  // const supabase = createClientComponentClient<Database>();
  // const { data: subs } = await supabase.from("subscriptions").select("*");

  return (
    <div className="p-6 text-white">
      <h1 className="text-2xl font-bold mb-4">Billing</h1>

      <div className="rounded border border-neutral-800 bg-neutral-900/40 p-4">
        <p className="text-sm text-neutral-300">
          Connect your billing provider and show plans, invoices, and payment methods here.
        </p>

        <ul className="mt-4 space-y-2 text-sm">
          <li className="flex items-center justify-between border border-neutral-800 rounded px-3 py-2">
            <span>Current Plan</span>
            <span className="font-semibold">Pro (example)</span>
          </li>
          <li className="flex items-center justify-between border border-neutral-800 rounded px-3 py-2">
            <span>Next Invoice</span>
            <span className="opacity-80">$99.00 on 2025-10-01</span>
          </li>
        </ul>

        <div className="mt-4 flex gap-2">
          <button className="px-3 py-2 rounded bg-orange-600 hover:bg-orange-500 text-black">
            Change Plan
          </button>
          <button className="px-3 py-2 rounded bg-neutral-800 border border-neutral-700">
            View Invoices
          </button>
        </div>
      </div>
    </div>
  );
}