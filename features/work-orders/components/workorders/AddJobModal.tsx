"use client";

import { Dialog } from "@headlessui/react";
import { useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  workOrderId: string;
  vehicleId: string | null;
  techId: string;
  onJobAdded?: () => void;
  shopId?: string | null;
}

export default function AddJobModal({
  isOpen,
  onClose,
  workOrderId,
  vehicleId,
  techId,
  onJobAdded,
  shopId,
}: Props) {
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [jobName, setJobName] = useState("");
  const [notes, setNotes] = useState("");
  const [labor, setLabor] = useState("");
  const [parts, setParts] = useState("");
  const [urgency, setUrgency] = useState<"low" | "medium" | "high">("medium");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!jobName.trim()) {
      alert("Job name is required.");
      return;
    }

    setSubmitting(true);
    setErr(null);

    try {
      // resolve shop_id
      let useShopId = shopId ?? null;
      if (!useShopId) {
        const { data: wo } = await supabase
          .from("work_orders")
          .select("shop_id")
          .eq("id", workOrderId)
          .maybeSingle();
        useShopId = wo?.shop_id ?? null;
      }
      if (!useShopId) throw new Error("Couldn’t resolve shop for this work order");

      // build payload
      const payload = {
        id: uuidv4(),
        work_order_id: workOrderId,
        vehicle_id: vehicleId,
        complaint: jobName.trim(),
        cause: null,
        correction: notes.trim() || null,
        labor_time: labor ? Number(labor) : null,
        parts: parts.trim() || null,
        status: "queued" as const,
        job_type: "repair" as const,
        shop_id: useShopId,
        ...(techId && techId !== "system" ? { assigned_to: techId } : {}),
        ...(urgency ? { urgency } : {}), // only if column exists
      };

      const { error } = await supabase.from("work_order_lines").insert(payload);
      if (error) throw error;

      onJobAdded?.();
      onClose();
      setJobName("");
      setNotes("");
      setLabor("");
      setParts("");
      setUrgency("medium");
    } catch (e: any) {
      setErr(e.message);
      alert("Failed to add job: " + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onClose={onClose} className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-black/50" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="w-full max-w-md rounded border border-neutral-800 bg-neutral-900 p-6 text-white shadow-xl">
          <Dialog.Title className="mb-2 text-lg font-bold font-header tracking-wide">
            Add New Job Line
          </Dialog.Title>

          <div className="space-y-3">
            <input
              type="text"
              className="w-full p-2 rounded bg-neutral-800 border border-neutral-700"
              placeholder="Job name (e.g. Replace serpentine belt)"
              value={jobName}
              onChange={(e) => setJobName(e.target.value)}
            />

            <textarea
              rows={3}
              className="w-full p-2 rounded bg-neutral-800 border border-neutral-700"
              placeholder="Notes or correction"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />

            <input
              type="number"
              step="0.1"
              className="w-full p-2 rounded bg-neutral-800 border border-neutral-700"
              placeholder="Labor hours"
              value={labor}
              onChange={(e) => setLabor(e.target.value)}
            />

            <textarea
              rows={2}
              className="w-full p-2 rounded bg-neutral-800 border border-neutral-700"
              placeholder="Parts required (comma-separated or list)"
              value={parts}
              onChange={(e) => setParts(e.target.value)}
            />

            <select
              className="w-full p-2 rounded bg-neutral-800 border border-neutral-700"
              value={urgency}
              onChange={(e) => setUrgency(e.target.value as "low" | "medium" | "high")}
            >
              <option value="low">Low Urgency</option>
              <option value="medium">Medium Urgency</option>
              <option value="high">High Urgency</option>
            </select>

            {err && <div className="text-sm text-red-400">{err}</div>}

            <div className="flex justify-end gap-2 pt-2">
              <button
                className="rounded border border-neutral-700 px-4 py-2 text-sm hover:border-orange-500"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                className="rounded bg-orange-600 px-4 py-2 text-sm font-semibold text-black hover:bg-orange-500 disabled:opacity-60"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? "Adding…" : "Add Job"}
              </button>
            </div>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}