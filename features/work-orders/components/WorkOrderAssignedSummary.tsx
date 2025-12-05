// src/features/work-orders/components/WorkOrderAssignedSummary.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type Props = {
  workOrderId: string;
};

type AssignmentRow = {
  technician_id: string | null;
  full_name: string | null;
  role: string | null;
  has_active: boolean | null;
};

export function WorkOrderAssignedSummary({ workOrderId }: Props) {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AssignmentRow[]>([]);

  useEffect(() => {
    if (!workOrderId) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.rpc(
          "get_work_order_assignments",
          { p_work_order_id: workOrderId },
        );

        if (error) {
          // eslint-disable-next-line no-console
          console.error("[WorkOrderAssignedSummary] rpc error:", error);
          if (!cancelled) {
            setRows([]);
          }
          return;
        }

        if (!cancelled) {
          setRows((data as AssignmentRow[] | null) ?? []);
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[WorkOrderAssignedSummary] unexpected error:", e);
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [supabase, workOrderId]);

  // ---------- derived values ----------

  const hasActive = useMemo(
    () => rows.some((r) => !!r.has_active),
    [rows],
  );

  const firstTechLabel = useMemo(() => {
    if (!rows.length) return null;
    const first = rows[0];
    const full = first.full_name || "Assigned tech";
    const firstName = full.split(" ")[0] || full;
    return firstName;
  }, [rows]);

  const extraCount = rows.length > 1 ? rows.length - 1 : 0;

  // ---------- Render states ----------

  if (loading) {
    return (
      <span className="inline-flex animate-pulse items-center rounded-full border border-neutral-700 bg-neutral-900/70 px-2.5 py-0.5 text-[0.7rem] text-neutral-400">
        Loading…
      </span>
    );
  }

  if (!rows.length || !firstTechLabel) {
    return (
      <span className="inline-flex items-center rounded-full border border-neutral-700 bg-neutral-950/80 px-2.5 py-0.5 text-[0.7rem] text-neutral-400">
        Unassigned
      </span>
    );
  }

  const base =
    "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[0.7rem] font-medium";
  const activeCls =
    "border-emerald-400/80 bg-emerald-500/15 text-emerald-100 shadow-[0_0_18px_rgba(16,185,129,0.8)]";
  const assignedCls =
    "border-amber-400/80 bg-amber-500/15 text-amber-50";

  return (
    <span
      className={`${base} ${hasActive ? activeCls : assignedCls}`}
      title={
        hasActive
          ? "At least one job line is currently punched in."
          : "Jobs assigned to technician(s) on this work order."
      }
    >
      {hasActive && (
        <span className="relative mr-0.5 inline-flex h-2 w-2 items-center justify-center">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-300" />
        </span>
      )}
      <span>{firstTechLabel}</span>
      {extraCount > 0 && (
        <span className="text-[0.65rem] text-neutral-100/80">
          +{extraCount} more
        </span>
      )}
    </span>
  );
}