// src/features/work-orders/components/WorkOrderAssignedSummary.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabase } from "@/features/shared/lib/supabase/client";

type Props = {
  workOrderId: string;
  refreshVersion?: number;
};

type AssignmentRow = {
  technician_id: string | null;
  full_name: string | null;
  role: string | null;
  has_active: boolean | null;
};

export function WorkOrderAssignedSummary({
  workOrderId,
  refreshVersion = 0,
}: Props) {
  const supabase = useMemo(() => createBrowserSupabase(), []);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AssignmentRow[]>([]);
  const [error, setError] = useState(false);
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    if (!workOrderId) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(false);
      try {
        const { data, error } = await supabase.rpc(
          "get_work_order_assignments",
          { p_work_order_id: workOrderId },
        );

        if (error) {
          console.error("[WorkOrderAssignedSummary] rpc error:", error);
          if (!cancelled) {
            setRows([]);
            setError(true);
          }
          return;
        }

        if (!cancelled) {
          setRows((data as AssignmentRow[] | null) ?? []);
        }
      } catch (e) {
        console.error("[WorkOrderAssignedSummary] unexpected error:", e);
        if (!cancelled) {
          setRows([]);
          setError(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [refreshVersion, retryVersion, supabase, workOrderId]);

  // ---------- derived values ----------

  const hasActive = useMemo(() => rows.some((r) => !!r.has_active), [rows]);

  const firstTechLabel = useMemo(() => {
    if (!rows.length) return null;
    const first = rows[0];
    if (!first.full_name) return "Unavailable technician";
    const full = first.full_name;
    const firstName = full.split(" ")[0] || full;
    return firstName;
  }, [rows]);

  const extraCount = rows.length > 1 ? rows.length - 1 : 0;

  // ---------- Render states ----------

  if (loading) {
    return (
      <span className="inline-flex animate-pulse items-center rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] px-2.5 py-0.5 text-[0.7rem] text-[color:var(--theme-text-secondary)]">
        Loading…
      </span>
    );
  }

  if (error) {
    return (
      <button
        type="button"
        className="inline-flex items-center rounded-full border border-rose-500/50 bg-rose-500/10 px-2.5 py-0.5 text-[0.7rem] font-medium text-rose-800 dark:text-rose-100"
        onClick={(event) => {
          event.stopPropagation();
          setRetryVersion((version) => version + 1);
        }}
      >
        Assignment unavailable · Retry
      </button>
    );
  }

  if (!rows.length || !firstTechLabel) {
    return (
      <span className="inline-flex items-center rounded-full border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-2.5 py-0.5 text-[0.7rem] text-[color:var(--theme-text-secondary)]">
        Unassigned
      </span>
    );
  }

  const base =
    "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[0.7rem] font-medium";
  const activeCls =
    "border-emerald-500/55 bg-emerald-500/15 text-emerald-800 shadow-[0_0_12px_rgba(16,185,129,0.12)] dark:border-emerald-400/80 dark:text-emerald-100 dark:shadow-[0_0_18px_rgba(16,185,129,0.45)]";
  const assignedCls =
    "border-amber-500/55 bg-amber-500/15 text-amber-900 dark:border-amber-400/80 dark:text-amber-100";

  return (
    <span
      className={`${base} ${hasActive ? activeCls : assignedCls}`}
      title={
        hasActive
          ? "At least one job line is currently punched in."
          : "Primary tech first, plus any supporting techs on this work order."
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
        <span className="text-[0.65rem] text-current opacity-75">
          +{extraCount} collaborators
        </span>
      )}
    </span>
  );
}
