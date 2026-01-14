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

  const fileName = useMemo(
    () => `Invoice_WorkOrder_${workOrderId}.pdf`,
    [workOrderId],
  );

  const download = useCallback(async (): Promise<void> => {
    if (busy) return;
    if (!workOrderId) return;

    setBusy(true);

    let url: string | null = null;

    try {
      const res = await fetch(`/api/work-orders/${workOrderId}/invoice-pdf`, {
        method: "GET",
        headers: { Accept: "application/pdf" },
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `PDF download failed (${res.status})`);
      }

      const blob = await res.blob();
      url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      if (url) {
        // give the browser a beat before revoking
        window.setTimeout(() => URL.revokeObjectURL(url as string), 1500);
      }
      setBusy(false);
    }
  }, [busy, workOrderId, fileName]);

  // optional auto-trigger (runs once per mount when enabled)
  useEffect(() => {
    if (!autoTrigger) return;
    if (!workOrderId) return;

    // queue microtask to avoid blocking paint
    queueMicrotask(() => void download());
  }, [autoTrigger, workOrderId, download]);

  return (
    <button
      type="button"
      onClick={() => void download()}
      disabled={!workOrderId || busy}
      className={
        className ??
        "rounded-full bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-black hover:brightness-110 disabled:opacity-60"
      }
    >
      {busy ? "Generating…" : "Download invoice PDF"}
    </button>
  );
}
