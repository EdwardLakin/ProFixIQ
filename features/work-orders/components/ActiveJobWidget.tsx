// features/work-orders/components/ActiveJobWidget.tsx
"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { toast } from "sonner";

import { supabaseBrowser as supabase } from "@/features/shared/lib/supabase/client";
import type { Database } from "@shared/types/types/supabase";

type DB = Database;
type WorkOrderLine = DB["public"]["Tables"]["work_order_lines"]["Row"];
type WorkOrder = DB["public"]["Tables"]["work_orders"]["Row"];
type Vehicle = DB["public"]["Tables"]["vehicles"]["Row"];

type ActiveJobState = {
  line: WorkOrderLine | null;
  workOrder: WorkOrder | null;
  vehicle: Vehicle | null;
};

export function ActiveJobWidget(): JSX.Element {
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<ActiveJobState>({
    line: null,
    workOrder: null,
    vehicle: null,
  });
  const [error, setError] = useState<string | null>(null);

  const loadActiveJob = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (userErr) throw userErr;

      if (!user) {
        setState({ line: null, workOrder: null, vehicle: null });
        setLoading(false);
        return;
      }

      // 🔍 Find the current user's active punched-in line
      const { data: line, error: lineErr } = await supabase
        .from("work_order_lines")
        .select("*")
        .eq("assigned_to", user.id)
        .not("punched_in_at", "is", null)
        .is("punched_out_at", null)
        .order("punched_in_at", { ascending: false })
        .maybeSingle<WorkOrderLine>();

      if (lineErr) throw lineErr;

      if (!line) {
        setState({ line: null, workOrder: null, vehicle: null });
        setLoading(false);
        return;
      }

      let workOrder: WorkOrder | null = null;
      let vehicle: Vehicle | null = null;

      if (line.work_order_id) {
        const { data: wo, error: woErr } = await supabase
          .from("work_orders")
          .select("*")
          .eq("id", line.work_order_id)
          .maybeSingle<WorkOrder>();
        if (woErr) throw woErr;
        workOrder = wo ?? null;

        if (workOrder?.vehicle_id) {
          const { data: veh, error: vehErr } = await supabase
            .from("vehicles")
            .select("*")
            .eq("id", workOrder.vehicle_id)
            .maybeSingle<Vehicle>();
          if (vehErr) throw vehErr;
          vehicle = veh ?? null;
        }
      }

      setState({ line, workOrder, vehicle });
    } catch (e) {
      console.error("[ActiveJobWidget] load error", e);
      const msg =
        (e as { message?: string })?.message ?? "Failed to load active job.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  // initial load
  useEffect(() => {
    void loadActiveJob();
  }, [loadActiveJob]);

  // refresh whenever job punch fires its global event
  useEffect(() => {
    const handler = () => void loadActiveJob();
    window.addEventListener("wol:refresh", handler);
    return () => window.removeEventListener("wol:refresh", handler);
  }, [loadActiveJob]);

  const { line, workOrder, vehicle } = state;

  const startedAt =
    line?.punched_in_at != null
      ? format(new Date(line.punched_in_at), "PPpp")
      : null;

  const href =
    workOrder && line
      ? `/work-orders/${workOrder.custom_id || workOrder.id}?focus=${line.id}`
      : "#";

  // --- UI states ---

  if (loading) {
    return (
      <div className="rounded-xl border border-neutral-800 bg-neutral-950/80 px-4 py-3 text-xs text-neutral-400">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
          Active job
        </div>
        <div className="mt-2 h-4 w-40 animate-pulse rounded-full bg-neutral-800" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-700/60 bg-red-950/60 px-4 py-3 text-xs text-red-100">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-300">
          Active job
        </div>
        <div className="mt-1">{error}</div>
      </div>
    );
  }

  if (!line || !workOrder) {
    return (
      <div className="rounded-xl border border-neutral-800 bg-neutral-950/80 px-4 py-3 text-xs text-neutral-400">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
          Active job
        </div>
        <div className="mt-1 text-neutral-300">
          No active job. Punch into a job to start tracking time.
        </div>
      </div>
    );
  }

  return (
    <Link
      href={href}
      onClick={() => {
        if (!workOrder || !line) {
          toast.error("Active job link is not available.");
        }
      }}
      className="group block rounded-xl border border-emerald-500/60 bg-neutral-950/90 px-4 py-3 text-xs text-neutral-200 shadow-[0_0_20px_rgba(16,185,129,0.45)] transition hover:border-emerald-400 hover:shadow-[0_0_26px_rgba(16,185,129,0.75)]"
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
          ● Active job
        </div>
        <div className="text-[10px] text-neutral-500">
          Tap to open work order
        </div>
      </div>

      <div className="text-sm font-medium text-neutral-50">
        WO {workOrder.custom_id || workOrder.id.slice(0, 8)}
      </div>
      <div className="mt-0.5 truncate text-[13px] text-neutral-200">
        {line.line_no ? `#${line.line_no} ` : ""}
        {line.description || line.complaint || "Job"}
      </div>

      {vehicle && (
        <div className="mt-0.5 truncate text-[11px] text-neutral-400">
          {vehicle.year ?? ""} {vehicle.make ?? ""} {vehicle.model ?? ""}{" "}
          {vehicle.license_plate ? `• ${vehicle.license_plate}` : ""}
        </div>
      )}

      {startedAt && (
        <div className="mt-1 text-[11px] text-emerald-200">
          Started <span className="font-mono">{startedAt}</span>
        </div>
      )}
    </Link>
  );
}