"use client";

import { useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database, TablesInsert } from "@shared/types/types/supabase";
import { serviceMenu } from "@/features/shared/lib/menuItems";

type DB = Database;
type WorkOrderLineInsert = TablesInsert<"work_order_lines">;

export function MenuQuickAdd({ workOrderId }: { workOrderId: string }) {
  const supabase = createClientComponentClient<DB>();
  const [addingId, setAddingId] = useState<string | null>(null);

  async function addFromMenu(item: {
    name: string;
    laborHours: number;
    partCost?: number;
  }) {
    setAddingId(item.name);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const line: WorkOrderLineInsert = {
      work_order_id: workOrderId,
      user_id: user?.id ?? null,           // ✅ satisfies RLS
      description: item.name,
      labor_time: typeof item.laborHours === "number" ? item.laborHours : null,
      status: "awaiting",                  // ✅ safe status
      job_type: "maintenance",             // optional: default for menu picks
      priority: 3,
    };

    const { error } = await supabase.from("work_order_lines").insert([line]);
    setAddingId(null);

    if (error) {
      console.error("MenuQuickAdd insert error:", error);
      alert(error.message);
    } else {
      // Let parent refresh; simplest is a full reload or a custom event.
      // window.location.reload();
      window.dispatchEvent(new CustomEvent("wo:line-added"));
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
            className="text-left border border-neutral-800 bg-neutral-950 hover:bg-neutral-900 rounded p-3 disabled:opacity-60"
          >
            <div className="font-medium">{m.name}</div>
            <div className="text-xs text-neutral-400">
              {typeof m.laborHours === "number" ? `${m.laborHours.toFixed(1)}h` : "—"}
              {m.partCost ? ` • ~$${m.partCost.toFixed(0)} parts` : ""}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}