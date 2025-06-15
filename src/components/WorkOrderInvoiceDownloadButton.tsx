"use client";

import { PDFDownloadLink } from "@react-pdf/renderer";
import { WorkOrderInvoicePDF } from "@components/WorkOrderInvoicePDF";
import { RepairLine } from "@lib/parseRepairOutput";

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
};

export function WorkOrderInvoiceDownloadButton({
  workOrderId,
  lines,
  summary,
  vehicleInfo,
  customerInfo,
}: Props) {
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
      fileName={`Invoice_WorkOrder_${workOrderId}.pdf`}
    >
      {({ loading }) =>
        loading ? (
          <button className="px-4 py-2 bg-gray-400 text-white rounded">
            Generating...
          </button>
        ) : (
          <button className="px-4 py-2 bg-blue-700 text-white rounded hover:bg-blue-800">
            Download Invoice PDF
          </button>
        )
      }
    </PDFDownloadLink>
  );
}
