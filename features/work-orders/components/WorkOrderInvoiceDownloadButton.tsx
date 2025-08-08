"use client";

import { useRef, useEffect } from "react";
import { BlobProvider } from "@react-pdf/renderer";
import { WorkOrderInvoicePDF } from "./WorkOrderInvoicePDF";
import type { RepairLine } from "@ai/lib/parseRepairOutput";

type Props = {
  workOrderId: string;
  lines: RepairLine[];
  summary?: string;
  vehicleInfo?: {
    year?: string;
    make?: string;
    model?: string;
    vin?: string;
  };
  customerInfo?: {
    name?: string;
    phone?: string;
    email?: string;
  };
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
  const fileName = `Invoice_WorkOrder_${workOrderId}.pdf`;

  useEffect(() => {
    if (autoTrigger && linkRef.current) {
      const t = setTimeout(() => linkRef.current?.click(), 500);
      return () => clearTimeout(t);
    }
  }, [autoTrigger]);

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
            <button className="px-4 py-2 bg-gray-400 text-white rounded">
              Generating…
            </button>
          );
        }

        if (error) {
          return (
            <span className="text-red-600">
              Failed to generate PDF: {String(error)}
            </span>
          );
        }

        // No URL yet (should be rare if not loading)
        if (!url) {
          return (
            <button className="px-4 py-2 bg-gray-400 text-white rounded" disabled>
              Preparing…
            </button>
          );
        }

        if (autoTrigger) {
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
              <button className="px-4 py-2 bg-blue-700 text-white rounded hover:bg-blue-800">
                Download Invoice PDF
              </button>
            </>
          );
        }

        return (
          <a
            href={url}
            download={fileName}
            className="px-4 py-2 bg-blue-700 text-white rounded hover:bg-blue-800"
          >
            Download Invoice PDF
          </a>
        );
      }}
    </BlobProvider>
  );
}