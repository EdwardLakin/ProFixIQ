"use client";

import { useMemo, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";
import ModalShell from "@/features/shared/components/ModalShell";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  workOrderId: string;
  vehicleId: string | null;
  techId: string;
  onJobAdded?: () => void;
  shopId?: string | null;
};

export default function AddJobModal(props: Props) {
  const { isOpen, onClose, workOrderId, vehicleId, techId, onJobAdded, shopId } =
    props;

  const supabase = useMemo(() => createBrowserSupabase(), []);
  const lastSetShopId = useRef<string | null>(null);

  const [jobName, setJobName] = useState("");
  const [notes, setNotes] = useState("");
  const [labor, setLabor] = useState("");
  const [parts, setParts] = useState("");
  const [urgency, setUrgency] = useState<"low" | "medium" | "high">("medium");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function ensureShopContext(id: string | null) {
    if (!id) return;
    if (lastSetShopId.current === id) return;

    const { error } = await supabase.rpc("set_current_shop_id", {
      p_shop_id: id,
    });
    if (error) throw error;

    lastSetShopId.current = id;
  }

  const handleSubmit = async () => {
    if (!jobName.trim()) {
      setErr("Job name is required.");
      return;
    }

    setSubmitting(true);
    setErr(null);

    try {
      // resolve shop_id
      let useShopId = shopId ?? null;
      if (!useShopId) {
        const { data: wo, error: woErr } = await supabase
          .from("work_orders")
          .select("shop_id")
          .eq("id", workOrderId)
          .maybeSingle();

        if (woErr) throw woErr;
        useShopId = (wo?.shop_id as string | null) ?? null;
      }
      if (!useShopId) throw new Error("Couldn’t resolve shop for this work order");

      await ensureShopContext(useShopId);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const payload = {
        id: uuidv4(),
        work_order_id: workOrderId,
        vehicle_id: vehicleId,
        complaint: jobName.trim(),
        cause: null,
        correction: notes.trim() || null,
        labor_time: labor ? Number(labor) : null,
        parts: parts.trim() || null,

        // ✅ IMPORTANT: new job should land in "awaiting approval"
        status: "awaiting_approval" as const,

        job_type: "repair" as const,
        shop_id: useShopId,

        ...(user?.id ? { user_id: user.id } : {}),
        ...(techId && techId !== "system" ? { assigned_to: techId } : {}),
        ...(urgency ? { urgency } : {}),
      };

      const { error } = await supabase.from("work_order_lines").insert(payload);

      if (error) {
        if (/row-level security/i.test(error.message)) {
          setErr("Access denied (RLS). Check that your session is scoped to this shop.");
          lastSetShopId.current = null;
        } else if (/status.*check/i.test(error.message)) {
          setErr("This status isn’t allowed by the database.");
        } else if (/job_type.*check/i.test(error.message)) {
          setErr("This job type isn’t allowed by the database.");
        } else {
          setErr(error.message);
        }
        return;
      }

      onJobAdded?.();
      onClose();

      setJobName("");
      setNotes("");
      setLabor("");
      setParts("");
      setUrgency("medium");
      setErr(null);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to add job.");
      lastSetShopId.current = null;
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      onClose={onClose}
      title="Add New Job Line"
      onSubmit={handleSubmit}
      submitText={submitting ? "Adding…" : "Add Job"}
      size="sm"
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-[0.16em] text-neutral-400">
            Job name
          </label>
          <input
            type="text"
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-[var(--accent-copper-light)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-copper-light)]"
            placeholder="e.g. Replace serpentine belt"
            value={jobName}
            onChange={(e) => setJobName(e.target.value)}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-[0.16em] text-neutral-400">
            Notes / correction
          </label>
          <textarea
            rows={3}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-[var(--accent-copper-light)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-copper-light)]"
            placeholder="Optional notes, concerns, or correction details…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-[0.16em] text-neutral-400">
              Labor hours
            </label>
            <input
              type="number"
              step="0.1"
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-[var(--accent-copper-light)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-copper-light)]"
              placeholder="e.g. 1.5"
              value={labor}
              onChange={(e) => setLabor(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-[0.16em] text-neutral-400">
              Urgency
            </label>
            <select
              className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white focus:border-[var(--accent-copper-light)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-copper-light)]"
              value={urgency}
              onChange={(e) => setUrgency(e.target.value as "low" | "medium" | "high")}
            >
              <option value="low">Low urgency</option>
              <option value="medium">Medium urgency</option>
              <option value="high">High urgency</option>
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-[0.16em] text-neutral-400">
            Parts required
          </label>
          <textarea
            rows={2}
            className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white placeholder:text-neutral-500 focus:border-[var(--accent-copper-light)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-copper-light)]"
            placeholder="Comma-separated list or short notes..."
            value={parts}
            onChange={(e) => setParts(e.target.value)}
          />
        </div>

        {err && (
          <div className="rounded-md border border-red-500/50 bg-red-950/40 px-3 py-2 text-xs text-red-100">
            {err}
          </div>
        )}
      </div>
    </ModalShell>
  );
}