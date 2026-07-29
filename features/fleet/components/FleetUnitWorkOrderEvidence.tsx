"use client";

import { useEffect, useMemo, useState } from "react";
import { Images, Play } from "lucide-react";

import EvidenceImage from "@/features/work-orders/components/evidence/EvidenceImage";
import {
  isVideoEvidence,
  type WorkOrderEvidenceItem,
} from "@/features/work-orders/lib/evidence/workOrderEvidence";

type WorkOrder = {
  id: string;
  custom_id: string | null;
  status: string | null;
  created_at: string | null;
};

type Line = {
  id: string;
  work_order_id: string;
  description: string | null;
  complaint: string | null;
  status: string | null;
};

type ResponseBody = {
  workOrders?: WorkOrder[];
  lines?: Line[];
  items?: WorkOrderEvidenceItem[];
  error?: string;
};

export default function FleetUnitWorkOrderEvidence({ unitId }: { unitId: string }) {
  const [data, setData] = useState<ResponseBody>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const response = await fetch(
        `/api/portal/fleet/units/${encodeURIComponent(unitId)}/evidence`,
        { cache: "no-store" },
      );
      const body = (await response.json().catch(() => null)) as ResponseBody | null;
      if (!cancelled) {
        setData(response.ok ? body ?? {} : { error: body?.error ?? "Unable to load evidence" });
        setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [unitId]);

  const groups = useMemo(() => {
    const workOrders = data.workOrders ?? [];
    const lines = data.lines ?? [];
    const items = data.items ?? [];
    return workOrders
      .map((workOrder) => ({
        workOrder,
        lines: lines
          .filter((line) => line.work_order_id === workOrder.id)
          .map((line) => ({
            line,
            items: items.filter((item) => item.workOrderLineId === line.id),
          }))
          .filter((line) => line.items.length > 0),
      }))
      .filter((group) => group.lines.length > 0);
  }, [data.items, data.lines, data.workOrders]);

  if (!loading && groups.length === 0 && !data.error) return null;

  return (
    <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[var(--theme-gradient-panel)] p-4">
      <div className="flex items-center gap-2">
        <Images className="h-4 w-4 text-[var(--brand-primary,#C1663B)]" />
        <div>
          <h2 className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
            Repair evidence
          </h2>
          <p className="text-xs text-[color:var(--theme-text-muted)]">
            Customer-visible photos and videos remain attached to each repair.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="mt-3 rounded-xl border border-dashed border-[color:var(--theme-border-soft)] p-4 text-sm text-[color:var(--theme-text-secondary)]">
          Loading repair evidence…
        </div>
      ) : data.error ? (
        <div className="mt-3 text-sm text-red-300">{data.error}</div>
      ) : (
        <div className="mt-4 space-y-4">
          {groups.map(({ workOrder, lines }) => (
            <article key={workOrder.id} className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
              <div className="text-xs font-semibold text-[color:var(--theme-text-primary)]">
                {workOrder.custom_id ?? `Work order ${workOrder.id.slice(0, 8)}`}
              </div>
              <div className="mt-3 space-y-3">
                {lines.map(({ line, items }) => (
                  <div key={line.id}>
                    <div className="text-xs text-[color:var(--theme-text-secondary)]">
                      {line.description || line.complaint || "Repair line"}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {items.map((item) => (
                        <a
                          key={item.id}
                          href={item.displayUrl ?? "#"}
                          target="_blank"
                          rel="noreferrer"
                          className="relative h-24 overflow-hidden rounded-lg border border-[color:var(--theme-border-soft)] bg-black"
                        >
                          {isVideoEvidence(item) && item.displayUrl ? (
                            <>
                              <video src={item.displayUrl} muted preload="metadata" className="h-full w-full object-cover" />
                              <Play className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 text-white" />
                            </>
                          ) : (
                            <EvidenceImage
                              item={item}
                              alt={item.fileName ?? "Repair evidence"}
                              className="h-full [&_img]:h-full [&_img]:object-cover"
                            />
                          )}
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

