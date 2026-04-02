"use client";

import { format } from "date-fns";
import Link from "next/link";
import type { Database } from "@shared/types/types/supabase";
import Card from "@shared/components/ui/Card";
import StatusBadge from "@shared/components/ui/StatusBadge";
import { cn } from "@shared/lib/utils";

type WorkOrderLine = Database["public"]["Tables"]["work_order_lines"]["Row"] & {
  vehicle?: {
    year?: number | null;
    make?: string | null;
    model?: string | null;
  } | null;
  assigned_tech_id?: {
    full_name?: string | null;
  } | null;
};

type NormalizedStatus =
  | "awaiting"
  | "in_progress"
  | "on_hold"
  | "completed";

const statusConfig: Record<
  NormalizedStatus,
  {
    badgeVariant: "info" | "active" | "warning" | "success";
    railClass: string;
    surfaceClass: string;
    label: string;
  }
> = {
  awaiting: {
    badgeVariant: "info",
    railClass: "bg-slate-400/80",
    surfaceClass:
      "bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.12),rgba(15,23,42,0.96))]",
    label: "Awaiting",
  },
  in_progress: {
    badgeVariant: "active",
    railClass:
      "bg-[linear-gradient(180deg,var(--accent-copper,#f97316),var(--accent-copper-light,#fdba74))]",
    surfaceClass:
      "bg-[radial-gradient(circle_at_top,_rgba(248,113,22,0.18),rgba(15,23,42,0.96))]",
    label: "In Progress",
  },
  on_hold: {
    badgeVariant: "warning",
    railClass: "bg-amber-400/85",
    surfaceClass:
      "bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.14),rgba(15,23,42,0.96))]",
    label: "On Hold",
  },
  completed: {
    badgeVariant: "success",
    railClass: "bg-emerald-400/85",
    surfaceClass:
      "bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.14),rgba(15,23,42,0.96))]",
    label: "Completed",
  },
};

function normalizeStatus(status: string | null | undefined): NormalizedStatus {
  switch (String(status ?? "").toLowerCase()) {
    case "in_progress":
      return "in_progress";
    case "on_hold":
      return "on_hold";
    case "completed":
      return "completed";
    default:
      return "awaiting";
  }
}

function labelValue(label: string, value: string) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3">
      <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
        {label}
      </div>
      <div className="mt-1 text-sm text-neutral-100">{value}</div>
    </div>
  );
}

interface WorkOrderCardProps {
  job: WorkOrderLine;
}

export default function WorkOrderCard({ job }: WorkOrderCardProps) {
  const {
    status,
    created_at,
    vehicle,
    assigned_tech_id,
    complaint,
    work_order_id,
  } = job;

  const normalizedStatus = normalizeStatus(status);
  const config = statusConfig[normalizedStatus];

  const vehicleInfo =
    [vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(" ") ||
    "Unknown vehicle";

  const created = created_at ? new Date(created_at) : null;
  const href = `/work-orders/view/${work_order_id ?? ""}`;

  return (
    <Link href={href} className="block">
      <Card
        className={cn(
          "relative overflow-hidden p-0 transition hover:-translate-y-[1px]",
          "border-white/10 hover:border-[color:var(--accent-copper-soft,#fdba74)]",
          config.surfaceClass,
        )}
      >
        <div className={cn("absolute inset-y-0 left-0 w-1", config.railClass)} />

        <div className="relative flex flex-col gap-4 p-5 pl-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <StatusBadge variant={config.badgeVariant}>
                {config.label}
              </StatusBadge>

              <div>
                <div className="text-base font-semibold text-white">
                  {vehicleInfo}
                </div>
                <div className="mt-1 text-xs uppercase tracking-[0.16em] text-neutral-500">
                  Work order
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className="text-[10px] uppercase tracking-[0.16em] text-neutral-500">
                Created
              </div>
              <div className="mt-1 text-xs text-neutral-300">
                {created ? format(created, "PPp") : "—"}
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {labelValue("Complaint", complaint?.trim() || "No complaint entered")}
            {labelValue(
              "Assigned",
              assigned_tech_id?.full_name?.trim() || "Unassigned",
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-3">
            <div className="text-xs text-neutral-400">
              Open work order details and continue workflow.
            </div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--accent-copper-light,#fdba74)]">
              Open →
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
