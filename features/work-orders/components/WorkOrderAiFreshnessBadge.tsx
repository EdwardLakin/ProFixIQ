"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@shared/lib/utils";
import StatusBadge from "@/features/shared/components/ui/StatusBadge";
import { PANEL_VARIANTS } from "@/features/shared/components/ui/panelHierarchy";
import type { WorkOrderAiFreshnessDto, WorkOrderAiFreshnessStatus } from "@/features/ai/server/domains/workOrders/getWorkOrderAiFreshness";

const STATUS_VARIANT: Record<WorkOrderAiFreshnessStatus, "success" | "warning" | "danger" | "neutral"> = {
  fresh: "success",
  aging: "warning",
  stale: "danger",
  missing: "neutral",
  needs_refresh: "warning",
};

function toSupportingCopy(dto: WorkOrderAiFreshnessDto): string {
  const latest = dto.latestRecommendationAt ?? dto.latestEvidenceAt;
  if (!latest) return "No AI evidence yet.";

  const date = new Date(latest);
  if (Number.isNaN(date.getTime())) return dto.description;

  return `AI signals updated ${formatDistanceToNow(date, { addSuffix: true })}.`;
}

export default function WorkOrderAiFreshnessBadge({ workOrderId }: { workOrderId: string }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dto, setDto] = useState<WorkOrderAiFreshnessDto | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/work-orders/${workOrderId}/ai/freshness`, { cache: "no-store" });
      const json = await res.json();

      if (!res.ok) {
        if (res.status === 403) {
          setDto(null);
          return;
        }
        throw new Error(json?.error ?? "Failed to load AI freshness.");
      }

      setDto(json as WorkOrderAiFreshnessDto);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load AI freshness.");
    } finally {
      setLoading(false);
    }
  }, [workOrderId]);

  useEffect(() => {
    void load();
  }, [load]);

  const supportingCopy = useMemo(() => (dto ? toSupportingCopy(dto) : ""), [dto]);

  if (loading) {
    return (
      <section className={cn(PANEL_VARIANTS.secondary, "p-2")}>
        <p className="text-[11px] text-muted-foreground">Loading AI freshness…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className={cn(PANEL_VARIANTS.secondary, "p-2")}>
        <p className="text-[11px] text-amber-200">AI freshness unavailable: {error}</p>
      </section>
    );
  }

  if (!dto) {
    return null;
  }

  return (
    <section className={cn(PANEL_VARIANTS.secondary, "p-2")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">AI freshness</span>
        <StatusBadge variant={STATUS_VARIANT[dto.status]} size="sm">
          {dto.label}
        </StatusBadge>
        <span className="text-[11px] text-muted-foreground">{supportingCopy}</span>
        <Link
          href="#ai-operational-recommendations"
          className="text-[11px] font-medium text-[rgba(184,115,51,0.95)] hover:underline"
        >
          View AI recommendations
        </Link>
      </div>
    </section>
  );
}
