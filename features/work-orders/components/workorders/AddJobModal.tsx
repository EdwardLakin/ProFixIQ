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
      setErr("Job name is required.");
      return;
    }

    setSubmitting(true);
    setErr(null);

    try {
      let useShopId = shopId ?? null;
      if (!useShopId) {
        const { data: wo } = await supabase
          .from("work_orders")
          .select("shop_id")
          .eq("id", workOrderId)
          .maybeSingle();
        useShopId = (wo?.shop_id as string | null) ?? null;
      }
      if (!useShopId) throw new Error("Couldn’t resolve shop for this work order");

      const payload = {
        id: uuidv4(),
        work_order_id: workOrderId,
        vehicle_id: vehicleId,
        complaint: jobName.trim(),
        cause: null,
        correction: notes.trim() || null,
        labor_time: labor ? Number(labor) : null,
        parts: parts.trim() || null,
        status: "awaiting" as const,
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
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      className="fixed inset-0 z-[400] flex items-center justify-center overflow-y-auto"
    >
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" aria-hidden="true" />

      <div className="relative z-[410] mx-4 my-6 w-full max-w-md">
        <Dialog.Panel className="w-full rounded-lg border border-border bg-background p-6 text-foreground shadow-xl">
          <Dialog.Title className="mb-3 text-lg font-semibold">
            Add New Job Line
          </Dialog.Title>

          <div className="space-y-3">
            <input
              type="text"
              className="w-full rounded border border-border bg-background p-2 text-sm"
              placeholder="Job name (e.g. Replace serpentine belt)"
              value={jobName}
              onChange={(e) => setJobName(e.target.value)}
            />

            <textarea
              rows={3}
              className="w-full rounded border border-border bg-background p-2 text-sm"
              placeholder="Notes or correction"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />

            <input
              type="number"
              step="0.1"
              className="w-full rounded border border-border bg-background p-2 text-sm"
              placeholder="Labor hours"
              value={labor}
              onChange={(e) => setLabor(e.target.value)}
            />

            <textarea
              rows={2}
              className="w-full rounded border border-border bg-background p-2 text-sm"
              placeholder="Parts required (comma-separated or list)"
              value={parts}
              onChange={(e) => setParts(e.target.value)}
            />

            <select
              className="w-full rounded border border-border bg-background p-2 text-sm"
              value={urgency}
              onChange={(e) =>
                setUrgency(e.target.value as "low" | "medium" | "high")
              }
            >
              <option value="low">Low Urgency</option>
              <option value="medium">Medium Urgency</option>
              <option value="high">High Urgency</option>
            </select>

            {err && <div className="text-sm text-destructive">{err}</div>}

            <div className="flex justify-end gap-2 pt-3">
              <button
                className="rounded border border-border px-4 py-2 text-sm hover:bg-muted"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                className="rounded border border-orange-500 px-4 py-2 text-sm font-semibold text-orange-500 hover:bg-orange-500/10 disabled:opacity-60"
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