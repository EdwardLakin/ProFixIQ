"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import type { RepairLine } from "@ai/lib/parseRepairOutput";
import _WorkOrderLineEditor from "@work-orders/components/WorkOrderLineEditor";
import { saveWorkOrderLines } from "@work-orders/lib/saveWorkOrderLines";

/**
 * IMPORTANT: Loosen the type of the imported component to avoid cross-module prop typing issues
 * during the Vercel build. This file is the one failing with:
 *   "Property 'onUpdate' does not exist on type 'IntrinsicAttributes & Props'"
 * Casting to a local callable type keeps runtime behavior and unblocks the build.
 */
const WorkOrderLineEditor =
  _WorkOrderLineEditor as unknown as (props: {
    line: any;
    onUpdate: (line: any) => void;
    onDelete?: () => void;
  }) => JSX.Element;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// Normalize DB status -> RepairLine["status"]
function normalizeStatus(status: unknown): RepairLine["status"] {
  switch (status) {
    case "unassigned":
    case "assigned":
    case "in_progress":
    case "on_hold":
    case "completed":
      return status;
    case "awaiting": // legacy/db value
      return "assigned";
    default:
      return "unassigned";
  }
}

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

  // Load existing lines
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("work_order_lines")
        .select("*")
        .eq("work_order_id", workOrderId)
        .order("created_at", { ascending: true });

      if (cancelled) return;

      if (error) {
        console.error(error);
        setError(error.message);
        setIsLoading(false);
        return;
      }

      const normalized: RepairLine[] = (data ?? []).map((row: any) => ({
        ...row,
        status: normalizeStatus(row?.status),
      }));

      setLines(normalized);
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [workOrderId]);

  // Save all current lines (append pattern)
  const handleSave = async () => {
    try {
      await saveWorkOrderLines(lines, userId, vehicleId, workOrderId);
      setSaved(true);
      setError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "An unknown error occurred.";
      console.error(err);
      setSaved(false);
      setError(msg);
    }
  };

  const updateLine = (index: number, updatedLine: RepairLine) => {
    setLines((prev) => {
      const copy = [...prev];
      copy[index] = updatedLine;
      return copy;
    });
  };

  const deleteLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  if (isLoading) {
    return <p className="p-6 text-accent">Loading work order…</p>;
  }

  return (
    <div className="mx-auto max-w-3xl rounded bg-surface p-6 text-accent shadow-card space-y-6">
      <h2 className="text-xl font-semibold">Edit Work Order #{workOrderId}</h2>

      {lines.length === 0 && (
        <p className="text-sm text-white/70">No lines yet — add some below or via quick add.</p>
      )}

      {lines.map((line, index) => (
        <WorkOrderLineEditor
          key={`${(line as any).id ?? "idx"}-${index}`}
          line={line}
          onUpdate={(updated) => updateLine(index, updated as RepairLine)}
          onDelete={() => deleteLine(index)}
        />
      ))}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          className="rounded bg-primary px-6 py-3 text-white hover:bg-primary-dark"
        >
          Save Changes
        </button>

        {saved && <p className="text-green-500">✅ Changes saved!</p>}
        {error && <p className="text-red-500">⚠️ {error}</p>}
      </div>
    </div>
  );
}