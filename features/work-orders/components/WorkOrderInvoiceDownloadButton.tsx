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

  // ✅ New: choose where the button goes
  mode?: "pdf" | "preview"; // default "pdf"

  // ✅ PDF behavior
  openInNewTab?: boolean; // default true
  forceDownload?: boolean; // default false (uses ?download=1)
};

export function WorkOrderInvoiceDownloadButton({
  workOrderId,
  autoTrigger = false,
  className,
  mode = "pdf",
  openInNewTab = true,
  forceDownload = false,
}: Props): JSX.Element {
  const [busy, setBusy] = useState(false);

  const urlToOpen = useMemo(() => {
    if (mode === "preview") return `/work-orders/${workOrderId}/invoice`;

    const base = `/api/work-orders/${workOrderId}/invoice-pdf`;
    return forceDownload ? `${base}?download=1` : base;
  }, [mode, workOrderId, forceDownload]);

  const open = useCallback(async (): Promise<void> => {
    if (busy) return;
    if (!workOrderId) return;

    setBusy(true);
    try {
      if (openInNewTab) {
        window.open(urlToOpen, "_blank", "noopener,noreferrer");
        return;
      }
      window.location.href = urlToOpen;
    } finally {
      setBusy(false);
    }
  }, [busy, workOrderId, openInNewTab, urlToOpen]);

  useEffect(() => {
    if (!autoTrigger) return;
    if (!workOrderId) return;
    queueMicrotask(() => void open());
  }, [autoTrigger, workOrderId, open]);

  const label =
    mode === "preview"
      ? "Open invoice preview"
      : openInNewTab
        ? "Open invoice PDF"
        : "View invoice PDF";

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
      {busy ? "Opening…" : label}
    </button>
  );
}