// features/work-orders/components/WorkOrderInvoiceDownloadButton.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { RepairLine } from "@ai/lib/parseRepairOutput";

type Props = {
  workOrderId: string;

  // kept for signature parity (server route generates PDF from DB)
  lines?: RepairLine[];
  summary?: string;
  vehicleInfo?: { year?: string; make?: string; model?: string; vin?: string };
  customerInfo?: { name?: string; phone?: string; email?: string };

  autoTrigger?: boolean;
  className?: string;
};

export function WorkOrderInvoiceDownloadButton({
  workOrderId,
  autoTrigger = false,
  className,
}: Props) {
  const [busy, setBusy] = useState(false);

  const href = useMemo(
    () => `/api/work-orders/${workOrderId}/invoice-pdf`,
    [workOrderId],
  );

  const open = useCallback(() => {
    if (!workOrderId) return;

    // busy just prevents double clicks
    setBusy(true);
    window.open(href, "_blank", "noopener,noreferrer");
    window.setTimeout(() => setBusy(false), 300);
  }, [workOrderId, href]);

  useEffect(() => {
    if (!autoTrigger) return;
    if (!workOrderId) return;

    queueMicrotask(() => open());
  }, [autoTrigger, workOrderId, open]);

  return (
    <button
      type="button"
      onClick={open}
      disabled={!workOrderId || busy}
      className={
        className ??
        "rounded-full bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-black hover:brightness-110 disabled:opacity-60"
      }
    >
      {busy ? "Opening…" : "Open invoice PDF"}
    </button>
  );
}