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
    railClass: "bg-[color:var(--theme-surface-subtle)]",
    surfaceClass:
      "bg-[var(--theme-gradient-panel)]",
    label: "Awaiting",
  },
  in_progress: {
    badgeVariant: "active",
    railClass:
      "bg-[linear-gradient(180deg,var(--accent-copper,#f97316),var(--accent-copper-light,#fdba74))]",
    surfaceClass:
      "bg-[var(--theme-gradient-panel)]",
    label: "In Progress",
  },
  on_hold: {
    badgeVariant: "warning",
    railClass: "bg-amber-400/85",
    surfaceClass:
      "bg-[var(--theme-gradient-panel)]",
    label: "On Hold",
  },
  completed: {
    badgeVariant: "success",
    railClass: "bg-emerald-400/85",
    surfaceClass:
      "bg-[var(--theme-gradient-panel)]",
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
    <div className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-3">
      <div className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
        {label}
      </div>
      <div className="mt-1 text-sm text-[color:var(--theme-text-primary)]">{value}</div>
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
          "border-[color:var(--theme-border-soft)] hover:border-[color:var(--accent-copper-soft,#fdba74)]",
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
                <div className="text-base font-semibold text-[color:var(--theme-text-primary)]">
                  {vehicleInfo}
                </div>
                <div className="mt-1 text-xs uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
                  Work order
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className="text-[10px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
                Created
              </div>
              <div className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
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

          <div className="flex items-center justify-between gap-3 border-t border-[color:var(--theme-border-soft)] pt-3">
            <div className="text-xs text-[color:var(--theme-text-secondary)]">
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
