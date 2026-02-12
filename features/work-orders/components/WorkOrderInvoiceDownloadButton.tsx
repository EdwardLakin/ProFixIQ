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

  // ✅ New: open PDF in new tab (default true)
  openInNewTab?: boolean;

  // ✅ Optional: force download (uses ?download=1)
  forceDownload?: boolean;
};

export function WorkOrderInvoiceDownloadButton({
  workOrderId,
  autoTrigger = false,
  className,
  openInNewTab = true,
  forceDownload = false,
}: Props) {
  const [busy, setBusy] = useState(false);

  const pdfUrl = useMemo(() => {
    const base = `/api/work-orders/${workOrderId}/invoice-pdf`;
    return forceDownload ? `${base}?download=1` : base;
  }, [workOrderId, forceDownload]);

  const open = useCallback(async (): Promise<void> => {
    if (busy) return;
    if (!workOrderId) return;

    setBusy(true);
    try {
      if (openInNewTab) {
        // ✅ let the browser open the PDF viewer
        window.open(pdfUrl, "_blank", "noopener,noreferrer");
        return;
      }

      // Fallback: if you ever set openInNewTab={false}, we still navigate.
      window.location.href = pdfUrl;
    } finally {
      setBusy(false);
    }
  }, [busy, workOrderId, openInNewTab, pdfUrl]);

  useEffect(() => {
    if (!autoTrigger) return;
    if (!workOrderId) return;
    queueMicrotask(() => void open());
  }, [autoTrigger, workOrderId, open]);

  return (
    <button
      type="button"
      onClick={() => void open()}
      disabled={!workOrderId || busy}
      className={
        className ??
        "rounded-full bg-[linear-gradient(to_right,var(--accent-copper-soft),var(--accent-copper))] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-black hover:brightness-110 disabled:opacity-60"
      }
    >
      {busy ? "Opening…" : openInNewTab ? "Open invoice PDF" : "View invoice PDF"}
    </button>
  );
}