"use client";

import { useEffect, useState } from "react";

interface WOItem {
  type: "diagnose" | "inspection" | "maintenance";
  description: string;
}

interface WorkOrder {
  id: string;
  userId: string;
  items: WOItem[];
  appointment: string;
  status: string;
  createdAt: string;
}

export default function WorkOrderQueue() {
  const [orders, setOrders] = useState<WorkOrder[]>([]);

  useEffect(() => {
    fetch("/api/workorders/list")
      .then((res) => res.json())
      .then((data) => setOrders(data.orders || []));
  }, []);

  const sortByPriority = (items: WOItem[]) => {
    const priority = { diagnose: 1, inspection: 2, maintenance: 3 };
    return [...items].sort((a, b) => priority[a.type] - priority[b.type]);
  };

  return (
    <div className="p-4 space-y-6">
      <h1 className="text-2xl font-bold text-orange-400">Work Order Queue</h1>

      {orders.length === 0 ? (
        <p className="text-white/70">No work orders in queue.</p>
      ) : (
        orders.map((wo) => (
          <div
            key={wo.id}
            className="rounded-lg bg-black/20 p-4 shadow-lg backdrop-blur-md border border-white/10"
          >
            <p className="text-sm text-white/70 mb-1">Appointment: {wo.appointment}</p>
            <ul className="text-white/90">
              {sortByPriority(wo.items).map((item, index) => (
                <li key={index}>• {item.type.toUpperCase()} — {item.description}</li>
              ))}
            </ul>

            <button
              className="mt-3 bg-orange-500 text-black px-4 py-2 rounded-md hover:bg-orange-400"
              onClick={() => alert("Punching into WO (future logic)")}
            >
              Punch In
            </button>
          </div>
        ))
      )}
    </div>
  );
}