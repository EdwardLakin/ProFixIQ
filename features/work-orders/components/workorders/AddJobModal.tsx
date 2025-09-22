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

// NOTE: accept `any` to bypass Next's serializable-props check, then cast.
export default function AddJobModal(props: any) {
  const { isOpen, onClose, workOrderId, vehicleId, techId, onJobAdded } =
    props as Props;

  const supabase = useMemo(() => createBrowserSupabase(), []);
  const [jobName, setJobName] = useState("");
  const [notes, setNotes] = useState("");
  const [urgency, setUrgency] = useState<Urgency>("medium");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const name = jobName.trim();
    if (!name) {
      alert("Job name is required.");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from("work_order_lines").insert({
        id: uuidv4(),
        work_order_id: workOrderId,
        vehicle_id: vehicleId,
        complaint: name,
        hold_reason: notes.trim() || null,
        status: "queued",
        job_type: "tech-suggested",
        assigned_to: techId,
        urgency,
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
        <Dialog.Panel className="w-full max-w-md rounded border border-neutral-800 bg-neutral-900 p-6 text-white shadow-xl">
          <Dialog.Title className="mb-2 text-lg font-bold font-header tracking-wide">
            Suggest New Job
          </Dialog.Title>

          <input
            type="text"
            className="font-sans w-full mb-3 p-2 rounded bg-neutral-800 border border-neutral-700 placeholder-neutral-400"
            placeholder="Job name (e.g. Replace serpentine belt)"
            value={jobName}
            onChange={(e) => setJobName(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") handleSubmit();
            }}
          />

          <select
            className="font-sans w-full mb-3 p-2 rounded bg-neutral-800 border border-neutral-700"
            value={urgency}
            onChange={(e) => setUrgency(e.target.value as Urgency)}
          >
            <option value="low">Low Urgency</option>
            <option value="medium">Medium Urgency</option>
            <option value="high">High Urgency</option>
          </select>

          <textarea
            rows={3}
            className="font-sans w-full mb-3 p-2 rounded bg-neutral-800 border border-neutral-700 placeholder-neutral-400"
            placeholder="Optional notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <div className="flex justify-end gap-2">
            <button
              className="rounded border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm hover:border-orange-500"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
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