"use client";

import { useRef, useEffect, useMemo, useCallback } from "react";
import { BlobProvider } from "@react-pdf/renderer";
import { WorkOrderInvoicePDF } from "./WorkOrderInvoicePDF";
import type { RepairLine } from "@ai/lib/parseRepairOutput";

type Props = {
  workOrderId: string;
  lines: RepairLine[];
  summary?: string;
  vehicleInfo?: { year?: string; make?: string; model?: string; vin?: string };
  customerInfo?: { name?: string; phone?: string; email?: string };
  autoTrigger?: boolean;
};

export function WorkOrderInvoiceDownloadButton({
  workOrderId,
  lines,
  summary,
  vehicleInfo,
  customerInfo,
  autoTrigger = false,
}: Props) {
  const linkRef = useRef<HTMLAnchorElement>(null);

  const fileName = useMemo(
    () => `Invoice_WorkOrder_${workOrderId}.pdf`,
    [workOrderId],
  );

  const clickDownload = useCallback(() => {
    linkRef.current?.click();
  }, []);

  useEffect(() => {
    if (!autoTrigger) return;
    const t = setTimeout(() => clickDownload(), 500);
    return () => clearTimeout(t);
  }, [autoTrigger, clickDownload]);

  return (
    <BlobProvider
      document={
        <WorkOrderInvoicePDF
          workOrderId={workOrderId}
          lines={lines}
          summary={summary}
          vehicleInfo={vehicleInfo}
          customerInfo={customerInfo}
        />
      }
    >
      {({ url, loading, error }) => {
        if (loading) {
          return (
            <button
              type="button"
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-neutral-200 opacity-80"
              disabled
            >
              Generating…
            </button>
          );
        }

        if (error) {
          return (
            <span className="text-xs text-red-300">
              Failed to generate PDF: {String(error)}
            </span>
          );
        }

        if (!url) {
          return (
            <button
              type="button"
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-neutral-200 opacity-80"
              disabled
            >
              Preparing…
            </button>
          );
        }

        return (
          <>
            <a
              ref={linkRef}
              href={url}
              download={fileName}
              style={{ display: "none" }}
            >
              Download
            </a>

            <button
              type="button"
              onClick={clickDownload}
              className="rounded-full border border-[var(--accent-copper-light)] bg-[var(--accent-copper)]/15 px-3 py-1.5 text-xs text-[var(--accent-copper-light)] hover:bg-[var(--accent-copper)]/25"
            >
              Download Invoice PDF
            </button>
          </>
        );
      }}
    </BlobProvider>
  );
}