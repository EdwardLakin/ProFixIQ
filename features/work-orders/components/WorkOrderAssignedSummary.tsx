// features/work-orders/components/WorkOrderAssignedSummary.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;

type Profile = DB["public"]["Tables"]["profiles"]["Row"];
type Line = DB["public"]["Tables"]["work_order_lines"]["Row"];
type LineTech =
  DB["public"]["Tables"]["work_order_line_technicians"]["Row"];

type MiniProfile = Pick<Profile, "id" | "full_name">;

type Props = {
  workOrderId: string;
};

export function WorkOrderAssignedSummary({ workOrderId }: Props) {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [loading, setLoading] = useState(true);
  const [assignedTechs, setAssignedTechs] = useState<MiniProfile[]>([]);
  const [hasActiveLine, setHasActiveLine] = useState(false);

  const load = useCallback(async () => {
    if (!workOrderId) return;

    setLoading(true);
    setHasActiveLine(false);
    setAssignedTechs([]);

    // 1) Fetch lines for this WO
    const { data: linesData, error: linesErr } = await supabase
      .from("work_order_lines")
      .select(
        "id, status, assigned_to, assigned_tech_id, punched_in_at, punched_out_at",
      )
      .eq("work_order_id", workOrderId);

    if (linesErr || !linesData) {
      setLoading(false);
      return;
    }

    const lines = linesData as Line[];

    // Active = any punched in and not punched out
    const active = lines.some(
      (l) => l.punched_in_at && !l.punched_out_at,
    );
    setHasActiveLine(active);

    // Collect tech IDs from direct columns
    const lineIds: string[] = [];
    const techIdSet = new Set<string>();

    for (const line of lines) {
      lineIds.push(line.id);
      if (line.assigned_to) {
        techIdSet.add(line.assigned_to as string);
      }
      if (line.assigned_tech_id) {
        techIdSet.add(line.assigned_tech_id as string);
      }
    }

    // 2) Also look at work_order_line_technicians (multi-assign link table)
    if (lineIds.length > 0) {
      const { data: linkData, error: linkErr } = await supabase
        .from("work_order_line_technicians")
        .select("work_order_line_id, technician_id")
        .in("work_order_line_id", lineIds);

      if (!linkErr && linkData) {
        (linkData as LineTech[]).forEach((row) => {
          if (row.technician_id) {
            techIdSet.add(row.technician_id as string);
          }
        });
      }
    }

    const techIds = Array.from(techIdSet);
    if (techIds.length === 0) {
      setAssignedTechs([]);
      setLoading(false);
      return;
    }

    // 3) Load profile names for the collected IDs
    const { data: profilesData, error: profErr } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", techIds);

    if (profErr || !profilesData) {
      setAssignedTechs([]);
      setLoading(false);
      return;
    }

    const profiles = profilesData as Profile[];

    // Preserve techIds order when mapping to profiles
    const ordered: MiniProfile[] = techIds
      .map((id) => profiles.find((p) => p.id === id))
      .filter(Boolean)
      .map((p) => ({
        id: p!.id,
        full_name: p!.full_name,
      }));

    setAssignedTechs(ordered);
    setLoading(false);
  }, [supabase, workOrderId]);

  useEffect(() => {
    void load();
  }, [load]);

  /* ------------------------------------------------------------------ */
  /* Rendering                                                          */
  /* ------------------------------------------------------------------ */

  if (loading) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-neutral-700 bg-black/60 px-2.5 py-1 text-[0.65rem] text-neutral-400">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-500" />
        Loading…
      </span>
    );
  }

  const count = assignedTechs.length;
  const first = assignedTechs[0];
  const moreCount = Math.max(0, count - 1);

  // Decide pill state
  let pillClass = "";
  let dotClass = "";
  let label = "";
  let sub = "";

  if (hasActiveLine) {
    // GREEN = there is an actively punched line
    pillClass =
      "border-emerald-400/80 bg-emerald-500/10 text-emerald-50 shadow-[0_0_18px_rgba(16,185,129,0.7)] animate-pulse";
    dotClass = "bg-emerald-400";

    if (count > 0) {
      label = first?.full_name ?? "Active job";
      sub =
        moreCount > 0
          ? `+${moreCount} more • ACTIVE`
          : "ACTIVE";
    } else {
      label = "Active job";
      sub = "Unassigned";
    }
  } else if (count > 0) {
    // YELLOW = assigned but no active punch
    pillClass =
      "border-amber-400/80 bg-amber-500/10 text-amber-50 shadow-[0_0_18px_rgba(251,191,36,0.6)] animate-pulse";
    dotClass = "bg-amber-400";

    label = first?.full_name ?? "Assigned tech";
    sub =
      moreCount > 0 ? `+${moreCount} more` : "Assigned";
  } else {
    // GREY = no assignment, no active punch
    pillClass =
      "border-neutral-700 bg-black/70 text-neutral-300";
    dotClass = "bg-neutral-500";
    label = "Unassigned";
    sub = "No tech selected";
  }

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[0.65rem] font-medium tracking-[0.12em] uppercase ${pillClass}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${dotClass}`}
      />
      <span className="flex flex-col gap-0 leading-tight">
        <span>{label}</span>
        <span className="text-[0.6rem] normal-case opacity-80">
          {sub}
        </span>
      </span>
    </span>
  );
}