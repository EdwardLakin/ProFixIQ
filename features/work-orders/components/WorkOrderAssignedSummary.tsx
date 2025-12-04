// features/work-orders/components/WorkOrderAssignedSummary.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type Profile = DB["public"]["Tables"]["profiles"]["Row"];
type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];
type WorkOrderLineTech =
  DB["public"]["Tables"]["work_order_line_technicians"]["Row"];

type Props = {
  workOrderId: string;
};

export function WorkOrderAssignedSummary({ workOrderId }: Props) {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [loading, setLoading] = useState(true);
  const [assignedTechs, setAssignedTechs] = useState<Profile[]>([]);
  const [hasActiveLine, setHasActiveLine] = useState(false);

  const load = useCallback(async () => {
    if (!workOrderId) return;

    setLoading(true);
    try {
      // 1) All lines on this work order
      const { data: lines, error: lineErr } = await supabase
        .from("work_order_lines")
        .select(
          "id, punched_in_at, punched_out_at, assigned_to, assigned_tech_id",
        )
        .eq("work_order_id", workOrderId);

      if (lineErr) {
        // eslint-disable-next-line no-console
        console.error("[WOAssignedSummary] lines error", lineErr);
        setAssignedTechs([]);
        setHasActiveLine(false);
        return;
      }

      const lineRows = (lines ?? []) as WorkOrderLine[];

      // active if any line is currently punched in
      const active =
        lineRows.some(
          (l) => l.punched_in_at && !l.punched_out_at,
        ) ?? false;
      setHasActiveLine(active);

      if (lineRows.length === 0) {
        setAssignedTechs([]);
        return;
      }

      const lineIds = lineRows.map((l) => l.id);

      // 2) Techs assigned via many-to-many table
      let techIds = new Set<string>();

      if (lineIds.length > 0) {
        const { data: assigns, error: assignsErr } = await supabase
          .from("work_order_line_technicians")
          .select("technician_id, work_order_line_id")
          .in("work_order_line_id", lineIds);

        if (!assignsErr && assigns) {
          (assigns as WorkOrderLineTech[]).forEach((a) => {
            if (a.technician_id) techIds.add(a.technician_id);
          });
        } else if (assignsErr) {
          // eslint-disable-next-line no-console
          console.error("[WOAssignedSummary] techs error", assignsErr);
        }
      }

      // 3) Also collect legacy single-assignment columns on lines
      lineRows.forEach((l) => {
        if (l.assigned_to) techIds.add(l.assigned_to);
        if (l.assigned_tech_id) techIds.add(l.assigned_tech_id);
      });

      const uniqueTechIds = Array.from(techIds).filter(Boolean);
      if (uniqueTechIds.length === 0) {
        setAssignedTechs([]);
        return;
      }

      // 4) Load profile names
      const { data: techProfiles, error: profErr } = await supabase
        .from("profiles")
        .select("id, full_name, role")
        .in("id", uniqueTechIds);

      if (profErr) {
        // eslint-disable-next-line no-console
        console.error("[WOAssignedSummary] profiles error", profErr);
        setAssignedTechs([]);
        return;
      }

      setAssignedTechs((techProfiles ?? []) as Profile[]);
    } finally {
      setLoading(false);
    }
  }, [supabase, workOrderId]);

  useEffect(() => {
    void load();
  }, [load]);

  /* ------------------------------------------------------------------ */
  /* Rendering                                                          */
  /* ------------------------------------------------------------------ */

  if (loading) {
    return (
      <span className="inline-flex items-center rounded-full bg-neutral-900/60 px-2 py-0.5 text-[0.7rem] text-neutral-400">
        Loading…
      </span>
    );
  }

  // No techs, but we DO have an active line → show an "Active (unassigned)" pill
  if (assignedTechs.length === 0) {
    if (hasActiveLine) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-[var(--accent-copper-light)] bg-[var(--accent-copper)]/15 px-2.5 py-0.5 text-[0.7rem] font-medium text-[var(--accent-copper-light)] shadow-[0_0_18px_rgba(249,115,22,0.65)]">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent-copper-light)] animate-pulse" />
          Active job – unassigned
        </span>
      );
    }

    return (
      <span className="text-[0.75rem] text-neutral-500">Unassigned</span>
    );
  }

  const [first, ...rest] = assignedTechs;
  const moreCount = rest.length;

  const shellClasses = hasActiveLine
    ? "inline-flex items-center gap-1 rounded-full border border-[var(--accent-copper-light)] bg-[var(--accent-copper)]/18 px-2.5 py-0.5 text-[0.7rem] text-sky-50 shadow-[0_0_22px_rgba(249,115,22,0.75)]"
    : "inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2.5 py-0.5 text-[0.7rem] text-sky-100";

  return (
    <div className={shellClasses}>
      <span
        className={
          hasActiveLine
            ? "inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"
            : "inline-block h-1.5 w-1.5 rounded-full bg-sky-400"
        }
      />
      <span>{first.full_name ?? "Mechanic"}</span>
      {moreCount > 0 && (
        <span className="text-[0.65rem] text-neutral-200">
          +{moreCount} more
        </span>
      )}
      {hasActiveLine && (
        <span className="ml-1 text-[0.6rem] uppercase tracking-[0.16em] text-[var(--accent-copper-light)]">
          Active
        </span>
      )}
    </div>
  );
}