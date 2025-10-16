"use client";

import { Dialog } from "@headlessui/react";
import { useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  workOrderId: string;
  vehicleId: string | null;
  techId: string;
  onJobAdded?: () => void;
  shopId?: string | null;
};

export default function AddJobModal(props: any) {
  // cast locally to keep IDE help, but avoid Next’s serializable-props rule
  const {
    isOpen,
    onClose,
    workOrderId,
    vehicleId,
    techId,
    onJobAdded,
    shopId,
  } = props as Props;

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
        ...(urgency ? { urgency } : {}),
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
    <Dialog
      open={isOpen}
      onClose={onClose}
      /* above FocusedJobModal (100/110) and ModalShell (300/310) */
      className="fixed inset-0 z-[330] flex items-center justify-center"
    >
      {/* backdrop */}
      <div className="fixed inset-0 z-[330] bg-black/70 backdrop-blur-sm" aria-hidden="true" />

      {/* centered panel */}
      <div className="relative z-[340] mx-4 my-6 w-full max-w-md">
        <Dialog.Panel className="w-full rounded-lg border border-orange-400 bg-neutral-950 p-6 text-white shadow-xl">
          <Dialog.Title className="mb-3 text-lg font-header font-semibold tracking-wide">
            Add New Job Line
          </Dialog.Title>

          <div className="space-y-3">
            <input
              type="text"
              className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-white placeholder:text-neutral-400"
              placeholder="Job name (e.g. Replace serpentine belt)"
              value={jobName}
              onChange={(e) => setJobName(e.target.value)}
            />

            <textarea
              rows={3}
              className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-white placeholder:text-neutral-400"
              placeholder="Notes or correction"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />

            <input
              type="number"
              step="0.1"
              className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-white placeholder:text-neutral-400"
              placeholder="Labor hours"
              value={labor}
              onChange={(e) => setLabor(e.target.value)}
            />

            <textarea
              rows={2}
              className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-white placeholder:text-neutral-400"
              placeholder="Parts required (comma-separated or list)"
              value={parts}
              onChange={(e) => setParts(e.target.value)}
            />

            <select
              className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-white"
              value={urgency}
              onChange={(e) => setUrgency(e.target.value as "low" | "medium" | "high")}
            >
              <option value="low">Low Urgency</option>
              <option value="medium">Medium Urgency</option>
              <option value="high">High Urgency</option>
            </select>

            {err && <div className="text-sm text-red-400">{err}</div>}

            <div className="flex justify-end gap-2 pt-3">
              <button
                className="font-header rounded border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-800"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                className="font-header rounded border border-orange-500 px-4 py-2 text-sm font-semibold text-orange-400 hover:bg-orange-500/10 disabled:opacity-60"
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