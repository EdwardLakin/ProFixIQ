"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { RepairLine } from "@lib/parseRepairOutput";
import WorkOrderLineEditor from "@components/WorkOrderLineEditor";
import { saveWorkOrderLines } from "@lib/saveWorkOrderLines";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export default function LoadWorkOrderById({
  userId,
  vehicleId,
  workOrderId,
}: {
  userId: string;
  vehicleId: string;
  workOrderId: string;
}) {
  const [lines, setLines] = useState<RepairLine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadLines = async () => {
      const { data, error } = await supabase
        .from("work_order_lines")
        .select("*")
        .eq("work_order_id", workOrderId);

      if (error) {
        console.error(error);
        setError(error.message);
      } else {
        setLines(data);
      }

      setIsLoading(false);
    };

    loadLines();
  }, [workOrderId]);

  const handleSave = async () => {
    try {
      await saveWorkOrderLines(lines, userId, vehicleId, workOrderId);
      setSaved(true);
      setError(null);
    } catch (err: any) {
      console.error(err);
      setError(err.message);
      setSaved(false);
    }
  };

  if (isLoading)
    return <p className="p-6 text-accent">Loading work order...</p>;

  return (
    <div className="max-w-3xl mx-auto p-6 bg-surface text-accent shadow-card rounded space-y-6">
      <h2 className="text-xl font-semibold">Edit Work Order #{workOrderId}</h2>

      <WorkOrderLineEditor lines={lines} onChange={setLines} />

      <button
        onClick={handleSave}
        className="px-6 py-3 bg-primary text-white rounded hover:bg-primary-dark"
      >
        Save Changes
      </button>

      {saved && <p className="text-green-500">✅ Changes saved!</p>}
      {error && <p className="text-red-500">⚠️ {error}</p>}
    </div>
  );
}
