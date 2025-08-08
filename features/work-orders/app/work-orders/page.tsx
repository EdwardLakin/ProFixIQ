// app/work-orders/page.tsx
"use client";

import { useRouter } from "next/navigation";

const pages = [
  { title: "Create Work Order", path: "/work-orders/create" },
  { title: "Customer Work Order Request", path: "/work-orders/customer" },
  { title: "Job Queue", path: "/work-orders/queue" },
  { title: "Quote Review", path: "/work-orders/quote-review" },
];

export default function WorkOrdersLandingPage() {
  const router = useRouter();

  return (
    <div className="max-w-xl mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold text-orange-400 mb-6">Work Orders</h1>

      <div className="space-y-4">
        {pages.map(({ title, path }) => (
          <button
            key={path}
            onClick={() => router.push(path)}
            className="w-full bg-neutral-800 hover:bg-orange-600 px-4 py-3 rounded-md text-white text-left font-semibold transition"
          >
            {title}
          </button>
        ))}
      </div>
    </div>
  );
}
