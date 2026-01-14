"use client";

import { useMemo, useState } from "react";
import type { RepairLine } from "@ai/lib/parseRepairOutput";

type Props = {
  workOrderId: string;
  // kept for signature parity, but server route generates from DB
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
  const fileName = useMemo(() => `Invoice_WorkOrder_${workOrderId}.pdf`, [workOrderId]);

  async function download(): Promise<void> {
    if (busy) return;
    if (!workOrderId) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/work-orders/${workOrderId}/invoice-pdf`, {
        method: "GET",
        headers: {
          Accept: "application/pdf",
        },
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `PDF download failed (${res.status})`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();

      // give the browser a beat before revoking
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } finally {
      setBusy(false);
    }
  }

  // optional auto-trigger
  // (kept because you used it earlier)
  // Only runs once per mount
  useMemo(() => {
    if (!autoTrigger) return;
    // queue microtask
    queueMicrotask(() => void download());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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