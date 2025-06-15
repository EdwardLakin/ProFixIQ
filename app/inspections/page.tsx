"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { generateCorrectionStory } from "@lib/generateCorrectionStoryFromInspection";
import { saveWorkOrderLines } from "@lib/saveWorkOrderLines";
import { RepairLine } from "@lib/parseRepairOutput";
import WorkOrderEditorPage from "@components/WorkOrderEditorPage";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

type Props = {
  inspectionId: string;
  userId: string;
  vehicleId: string;
};

export default function InspectionToWorkOrder({
  inspectionId,
  userId,
  vehicleId,
}: Props) {
  const [workOrderId, setWorkOrderId] = useState<string | null>(null);
  const [lines, setLines] = useState<RepairLine[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        // Step 1: Load inspection items
        const { data: items, error: fetchError } = await supabase
          .from("inspection_items")
          .select("*")
          .eq("inspection_id", inspectionId);

        if (fetchError || !items || items.length === 0) {
          throw new Error("Could not load inspection items.");
        }

        // Step 2: Generate correction summary
        const summary = generateCorrectionStory(items);

        // Step 3: Create new work order
        const { data: newOrder, error: orderError } = await supabase
          .from("work_orders")
          .insert([
            {
              user_id: userId,
              vehicle_id: vehicleId,
              status: "generated",
              summary: summary,
            },
          ])
          .select()
          .single();

        if (orderError || !newOrder) {
          throw new Error("Failed to create work order.");
        }

        const newWorkOrderId = newOrder.id;
        setWorkOrderId(newWorkOrderId);

        // Step 4: Convert inspection items into work order lines
        const parsed: RepairLine[] = items.map((item) => ({
          complaint: `${item.category}: ${item.item}`,
          cause: item.notes || "",
          correction: item.status === "fail" ? "Repair or replace" : "",
          tools: [],
          labor_time: "",
        }));

        // Add correction summary as its own line
        parsed.push({
          complaint: "General Repair Summary",
          cause: "",
          correction: summary,
          tools: [],
          labor_time: "",
        });

        // Step 5: Save lines
        await saveWorkOrderLines(parsed, userId, vehicleId, newWorkOrderId);

        setLines(parsed);
      } catch (err: any) {
        console.error(err);
        setError(err.message || "Unexpected error");
      }
    };

    run();
  }, [inspectionId, userId, vehicleId]);

  if (error) {
    return <p className="p-4 text-red-500">❌ {error}</p>;
  }

  if (!workOrderId || !lines) {
    return (
      <p className="p-4 text-accent">
        Generating work order from inspection...
      </p>
    );
  }

  // ✅ Show editable work order UI
  return (
    <WorkOrderEditorPage
      userId={userId}
      vehicleId={vehicleId}
      workOrderId={workOrderId}
      initialLines={lines}
    />
  );
}
