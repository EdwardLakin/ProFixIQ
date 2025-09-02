// features/work-orders/components/MenuQuickAdd.tsx
"use client";

import { useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database, TablesInsert } from "@shared/types/types/supabase";
import { serviceMenu } from "@/features/shared/lib/menuItems"; // adjust path if different

type WorkOrderLineInsert = TablesInsert<"work_order_lines">;

export function MenuQuickAdd({ workOrderId }: { workOrderId: string }) {
  const supabase = createClientComponentClient<Database>();
  const [addingId, setAddingId] = useState<string | null>(null);

  async function addFromMenu(item: {
    name: string;
    laborHours: number;
    partCost: number;
  }) {
    setAddingId(item.name);

    // Map to real columns in `work_order_lines`
    const line: WorkOrderLineInsert = {
      work_order_id: workOrderId,
      description: item.name,          // schema has no 'title'/'name' field
      labor_time: item.laborHours ?? null,
      status: "planned",
      priority: 3,
      // (optional) you could stash price data in a JSON field if you want:
      // parts_required: [{ name: item.name, est_cost: item.partCost }] as any,
    };

    const { error } = await supabase.from("work_order_lines").insert([line]);
    setAddingId(null);

    if (error) {
      console.error("Failed to add line:", error);
      return;
    }
  }

  return (
    <div className="space-y-2">
      <h3 className="font-semibold text-orange-400">Quick add from menu</h3>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {serviceMenu.map((m) => (
          <button
            key={m.name}
            onClick={() => addFromMenu(m)}
            disabled={addingId === m.name}
            className="text-left border border-neutral-800 bg-neutral-950 hover:bg-neutral-900 rounded p-3"
          >
            <div className="font-medium">{m.name}</div>
            <div className="text-xs text-neutral-400">
              {m.laborHours.toFixed(1)}h
              {m.partCost ? ` • ~$${m.partCost.toFixed(0)} parts` : ""}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}