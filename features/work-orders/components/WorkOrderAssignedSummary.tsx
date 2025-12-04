// src/features/work-orders/components/WorkOrderAssignedSummary.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type Line = DB["public"]["Tables"]["work_order_lines"]["Row"];
type LineTech =
  DB["public"]["Tables"]["work_order_line_technicians"]["Row"];
type Profile = DB["public"]["Tables"]["profiles"]["Row"];

type Props = {
  workOrderId: string;
};

export function WorkOrderAssignedSummary({ workOrderId }: Props) {
  const supabase = useMemo(() => createClientComponentClient<DB>(), []);

  const [loading, setLoading] = useState(true);
  const [assignedIds, setAssignedIds] = useState<string[]>([]);
  const [profilesById, setProfilesById] = useState<
    Record<string, Pick<Profile, "id" | "full_name" | "role">>
  >({});
  const [hasActive, setHasActive] = useState(false);

  useEffect(() => {
    if (!workOrderId) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setHasActive(false);
      setAssignedIds([]);
      setProfilesById({});

      try {
        // 1) Lines for this work order
        const { data: linesData, error: linesErr } = await supabase
          .from("work_order_lines")
          .select(
            "id, assigned_tech_id, punched_in_at, punched_out_at",
          )
          .eq("work_order_id", workOrderId);

        if (linesErr) {
          // eslint-disable-next-line no-console
          console.error("[WorkOrderAssignedSummary] lines error:", linesErr);
          if (!cancelled) setLoading(false);
          return;
        }

        const lines = (linesData ?? []) as Pick<
          Line,
          "id" | "assigned_tech_id" | "punched_in_at" | "punched_out_at"
        >[];

        if (cancelled) return;

        // active = any punched in and not punched out
        const active = lines.some(
          (l) => l.punched_in_at && !l.punched_out_at,
        );
        setHasActive(active);

        if (lines.length === 0) {
          if (!cancelled) setLoading(false);
          return;
        }

        const lineIds = lines.map((l) => l.id);

        // 2) Collect tech ids from lines + line_technicians
        const techIdSet = new Set<string>();

        // from assigned_tech_id on the line
        lines.forEach((l) => {
          const t = l.assigned_tech_id as string | null;
          if (t) techIdSet.add(t);
        });

        // from junction table
        const { data: ltData, error: ltErr } = await supabase
          .from("work_order_line_technicians")
          .select("work_order_line_id, technician_id")
          .in("work_order_line_id", lineIds);

        if (ltErr) {
          // eslint-disable-next-line no-console
          console.error(
            "[WorkOrderAssignedSummary] line_technicians error:",
            ltErr,
          );
        } else {
          (ltData as LineTech[] | null)?.forEach((lt) => {
            const tid = lt.technician_id as string;
            if (tid) techIdSet.add(tid);
          });
        }

        const techIds = Array.from(techIdSet);

        if (cancelled) return;

        if (techIds.length === 0) {
          setAssignedIds([]);
          setProfilesById({});
          setLoading(false);
          return;
        }

        // 3) Resolve profiles
        const { data: profs, error: profErr } = await supabase
          .from("profiles")
          .select("id, full_name, role")
          .in("id", techIds);

        if (profErr) {
          // eslint-disable-next-line no-console
          console.error("[WorkOrderAssignedSummary] profiles error:", profErr);
          if (!cancelled) {
            setAssignedIds([]);
            setProfilesById({});
            setLoading(false);
          }
          return;
        }

        if (cancelled) return;

        const map: Record<
          string,
          Pick<Profile, "id" | "full_name" | "role">
        > = {};
        (profs ?? []).forEach((p) => {
          map[p.id] = {
            id: p.id,
            full_name: p.full_name,
            role: p.role,
          };
        });

        setProfilesById(map);

        // preserve original order where possible
        const ordered = techIds.filter((id) => map[id]);
        setAssignedIds(ordered);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[WorkOrderAssignedSummary] unexpected error:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [supabase, workOrderId]);

  const firstTechLabel = useMemo(() => {
    if (!assignedIds.length) return null;
    const first = profilesById[assignedIds[0]];
    const full = first?.full_name ?? "Assigned tech";
    const firstName = full.split(" ")[0] || full;
    return firstName;
  }, [assignedIds, profilesById]);

  const extraCount = assignedIds.length > 1 ? assignedIds.length - 1 : 0;

  // ---------- Render states ----------

  if (loading) {
    return (
      <span className="inline-flex animate-pulse items-center rounded-full border border-neutral-700 bg-neutral-900/70 px-2.5 py-0.5 text-[0.7rem] text-neutral-400">
        Loading…
      </span>
    );
  }

  if (!assignedIds.length || !firstTechLabel) {
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
          : "Jobs assigned to this technician."
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