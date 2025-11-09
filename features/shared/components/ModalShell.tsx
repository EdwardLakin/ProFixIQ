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

export default function AddJobModal(rawProps: any) {
  const {
    isOpen,
    onClose,
    workOrderId,
    vehicleId,
    techId,
    onJobAdded,
    shopId,
  } = rawProps as Props;

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
      className="fixed inset-0 z-[500] flex items-center justify-center p-4 sm:p-6"
    >
      <div
        className="fixed inset-0 z-[500] bg-black/60 backdrop-blur-sm"
        aria-hidden="true"
      />

      <div className="relative z-[510] w-full max-w-md">
        <Dialog.Panel className="w-full rounded-lg border border-border bg-background text-foreground shadow-xl dark:border-orange-400/90 dark:bg-neutral-950">
          <Dialog.Title className="border-b border-border/60 px-6 py-4 text-lg font-header font-semibold tracking-wide dark:border-neutral-800">
            Add New Job Line
          </Dialog.Title>

          <div className="space-y-3 px-6 py-5">
            <input
              type="text"
              className="w-full rounded border border-border/60 bg-background px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
              placeholder="Job name (e.g. Replace serpentine belt)"
              value={jobName}
              onChange={(e) => setJobName(e.target.value)}
            />

            <textarea
              rows={3}
              className="w-full rounded border border-border/60 bg-background px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
              placeholder="Notes or correction"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />

            <input
              type="number"
              step="0.1"
              className="w-full rounded border border-border/60 bg-background px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
              placeholder="Labor hours"
              value={labor}
              onChange={(e) => setLabor(e.target.value)}
            />

            <textarea
              rows={2}
              className="w-full rounded border border-border/60 bg-background px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
              placeholder="Parts required (comma-separated or list)"
              value={parts}
              onChange={(e) => setParts(e.target.value)}
            />

            <select
              className="w-full rounded border border-border/60 bg-background px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
              value={urgency}
              onChange={(e) => setUrgency(e.target.value as "low" | "medium" | "high")}
            >
              <option value="low">Low Urgency</option>
              <option value="medium">Medium Urgency</option>
              <option value="high">High Urgency</option>
            </select>

            {err && <div className="text-sm text-red-500 dark:text-red-400">{err}</div>}
          </div>

          <div className="flex justify-end gap-2 border-t border-border/60 px-6 py-4 dark:border-neutral-800">
            <button
              className="font-header rounded border border-border/70 bg-background px-4 py-2 text-sm hover:bg-muted dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              className="font-header rounded bg-orange-500 px-4 py-2 text-sm font-semibold text-black hover:bg-orange-400 disabled:opacity-60"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? "Adding…" : "Add Job"}
            </button>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}