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
  const {
    isOpen,
    onClose,
    workOrderId,
    vehicleId,
    techId,
    onJobAdded,
    shopId,
  } = props;

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

      // get current user for user_id if your RLS expects it
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
        status: "awaiting" as const,
        job_type: "repair" as const,
        shop_id: useShopId,
        ...(user?.id ? { user_id: user.id } : {}),
        ...(techId && techId !== "system" ? { assigned_to: techId } : {}),
        ...(urgency ? { urgency } : {}),
      };

      const { error } = await supabase.from("work_order_lines").insert(payload);
      if (error) {
        // handle common RLS / check errors a bit nicer
        if (/row-level security/i.test(error.message)) {
          setErr(
            "Access denied (RLS). Check that your session is scoped to this shop."
          );
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

      // reset fields
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
      <div className="space-y-3">
        <input
          type="text"
          className="w-full rounded border border-border/60 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
          placeholder="Job name (e.g. Replace serpentine belt)"
          value={jobName}
          onChange={(e) => setJobName(e.target.value)}
        />

        <textarea
          rows={3}
          className="w-full rounded border border-border/60 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
          placeholder="Notes or correction"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />

        <input
          type="number"
          step="0.1"
          className="w-full rounded border border-border/60 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
          placeholder="Labor hours"
          value={labor}
          onChange={(e) => setLabor(e.target.value)}
        />

        <textarea
          rows={2}
          className="w-full rounded border border-border/60 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
          placeholder="Parts required (comma-separated or list)"
          value={parts}
          onChange={(e) => setParts(e.target.value)}
        />

        <select
          className="w-full rounded border border-border/60 bg-background px-3 py-2 text-sm text-foreground dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
          value={urgency}
          onChange={(e) =>
            setUrgency(e.target.value as "low" | "medium" | "high")
          }
        >
          <option value="low">Low Urgency</option>
          <option value="medium">Medium Urgency</option>
          <option value="high">High Urgency</option>
        </select>

        {err && <div className="text-sm text-red-400">{err}</div>}
      </div>
    </ModalShell>
  );
}