"use client";

import { PDFViewer } from "@react-pdf/renderer";
import { WorkOrderInvoicePDF } from "@components/WorkOrderInvoicePDF";
import { RepairLine } from "@lib/parseRepairOutput";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  workOrderId: string;
  vehicleInfo?: { year?: string; make?: string; model?: string; vin?: string };
  customerInfo?: { name?: string; phone?: string; email?: string };
  lines: RepairLine[];
  summary?: string;
};

export default function InvoicePreviewModal({
  isOpen,
  onClose,
  workOrderId,
  vehicleInfo,
  customerInfo,
  lines,
  summary,
}: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
      <div className="bg-white dark:bg-surface max-w-4xl w-full h-[90vh] shadow-xl border border-gray-300 dark:border-gray-700 rounded-md overflow-hidden">
        <div className="flex justify-between items-center px-4 py-2 border-b dark:border-gray-700 bg-gray-100 dark:bg-neutral-800">
          <h2 className="text-lg font-semibold">Invoice Preview</h2>
          <button
            onClick={onClose}
            className="text-sm text-blue-600 dark:text-accent underline"
          >
            Close
          </button>
        </div>
        <PDFViewer width="100%" height="100%">
          <WorkOrderInvoicePDF
            workOrderId={workOrderId}
            vehicleInfo={vehicleInfo}
            customerInfo={customerInfo}
            lines={lines}
            summary={summary}
          />
        </PDFViewer>
      </div>
    </div>
  );
}
