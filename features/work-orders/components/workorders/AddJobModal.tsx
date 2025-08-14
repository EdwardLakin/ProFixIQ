"use client";

import { Dialog } from "@headlessui/react";
import { useMemo, useState } from "react";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import { v4 as uuidv4 } from "uuid";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  workOrderId: string;
  vehicleId: string;
  techId: string;
  onJobAdded?: () => void;
}

type Urgency = "low" | "medium" | "high";

export default function AddJobModal({
  isOpen,
  onClose,
  workOrderId,
  vehicleId,
  techId,
  onJobAdded,
}: Props) {
  // ✅ create the client inside the component (memoized once)
  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [jobName, setJobName] = useState("");
  const [notes, setNotes] = useState("");
  const [urgency, setUrgency] = useState<Urgency>("medium");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!jobName.trim()) {
      alert("Job name is required.");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from("work_order_lines").insert({
        id: uuidv4(),
        work_order_id: workOrderId,
        vehicle_id: vehicleId,
        complaint: jobName.trim(),
        hold_reason: notes.trim() || null,
        status: "queued",              // ensure this matches your enum values
        job_type: "tech-suggested",    // ensure this matches your enum values
        assigned_to: techId,
        urgency,                       // "low" | "medium" | "high"
        // created_at / updated_at typically come from DB defaults
      });

      if (error) {
        alert("Failed to add job: " + error.message);
        return;
      }

      onJobAdded?.();
      onClose();
      setJobName("");
      setNotes("");
      setUrgency("medium");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onClose={onClose} className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-black/50" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Panel className="w-full max-w-md bg-white dark:bg-gray-900 rounded p-6">
          <Dialog.Title className="text-lg font-semibold mb-2">
            Suggest New Job
          </Dialog.Title>

          <input
            type="text"
            className="w-full mb-3 p-2 rounded bg-neutral-100 dark:bg-neutral-800"
            placeholder="Job name (e.g. Replace serpentine belt)"
            value={jobName}
            onChange={(e) => setJobName(e.target.value)}
          />

          <select
            className="w-full mb-3 p-2 rounded bg-neutral-100 dark:bg-neutral-800"
            value={urgency}
            onChange={(e) => setUrgency(e.target.value as Urgency)}
          >
            <option value="low">Low Urgency</option>
            <option value="medium">Medium Urgency</option>
            <option value="high">High Urgency</option>
          </select>

          <textarea
            rows={3}
            className="w-full mb-3 p-2 rounded bg-neutral-100 dark:bg-neutral-800"
            placeholder="Optional notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <div className="flex justify-end gap-2">
            <button
              className="bg-gray-500 text-white px-4 py-2 rounded"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-60"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? "Adding..." : "Add Job"}
            </button>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}