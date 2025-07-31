'use client';

import { useRef, useEffect } from 'react';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { WorkOrderInvoicePDF } from './WorkOrderInvoicePDF';
import type { RepairLine } from '@/lib/parseRepairOutput';
import type { ReactNode } from 'react';

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
}: Props): ReactNode {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const fileName = `Invoice_WorkOrder_${workOrderId}.pdf`;

  useEffect(() => {
    if (autoTrigger && linkRef.current) {
      const timeout = setTimeout(() => {
        linkRef.current?.click();
      }, 1000);
      return () => clearTimeout(timeout);
    }
  }, [autoTrigger]);

  return (
    <PDFDownloadLink
      document={
        <WorkOrderInvoicePDF
          workOrderId={workOrderId}
          lines={lines}
          summary={summary}
          vehicleInfo={vehicleInfo}
          customerInfo={customerInfo}
        />
      }
      fileName={fileName}
    >
      {({ loading, url }) => {
        if (loading) {
          return (
            <button className="px-4 py-2 bg-gray-400 text-white rounded">
              Generating...
            </button>
          );
        }

        if (autoTrigger && url) {
          return (
            <>
              <a
                ref={linkRef}
                href={url}
                download={fileName}
                style={{ display: 'none' }}
              >
                Auto Download
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
    </PDFDownloadLink>
  );
}