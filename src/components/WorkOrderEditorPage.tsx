'use client'

import { useState } from 'react'
import toast from 'react-hot-toast'
import { RepairLine } from '../lib/parseRepairOutput'
import { WorkOrderInvoicePDF } from './WorkOrderInvoicePDF'
import { PDFDownloadLink } from '@react-pdf/renderer'
import InvoicePreviewModal from './InvoicePreviewModal'

type Props = {
  workOrderId: string
  vehicleInfo?: { year?: string; make?: string; model?: string; vin?: string }
  customerInfo?: { name?: string; phone?: string; email?: string }
  lines: RepairLine[]
  summary?: string
}

export default function WorkOrderEditorPage({
  workOrderId,
  vehicleInfo,
  customerInfo,
  lines,
  summary,
}: Props) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [isSending, setIsSending] = useState(false)

  const sendInvoice = async () => {
    try {
      setIsSending(true)
      const res = await fetch('/api/send-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workOrderId, vehicleInfo, customerInfo, lines, summary }),
      })

      if (!res.ok) throw new Error('Failed to send invoice')
      toast.success('Invoice sent successfully!')
    } catch (err) {
      toast.error('Failed to send invoice')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold mb-4">Work Order #{workOrderId}</h1>

      <div className="space-x-4 mb-6">
        <button
          onClick={() => setIsPreviewOpen(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Preview Invoice
        </button>

        <PDFDownloadLink
          document={
            <WorkOrderInvoicePDF
              workOrderId={workOrderId}
              vehicleInfo={vehicleInfo}
              customerInfo={customerInfo}
              lines={lines}
              summary={summary}
            />
          }
          fileName={`invoice-${workOrderId}.pdf`}
        >
          {({ loading }) =>
            loading ? (
              <span className="text-gray-500">Preparing PDF…</span>
            ) : (
              <button className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
                Download PDF
              </button>
            )
          }
        </PDFDownloadLink>

        <button
          onClick={sendInvoice}
          disabled={isSending}
          className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 disabled:opacity-50"
        >
          {isSending ? 'Sending…' : 'Send Invoice'}
        </button>
      </div>

      <InvoicePreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        workOrderId={workOrderId}
        vehicleInfo={vehicleInfo}
        customerInfo={customerInfo}
        lines={lines}
        summary={summary}
      />
    </div>
  )
}