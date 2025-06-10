'use client'

import { useEffect, useState } from 'react'
import WorkOrderLineEditor from './WorkOrderLineEditor'
import { parseRepairOutput, RepairLine } from '../lib/parseRepairOutput'
import { saveWorkOrderLines } from '../lib/saveWorkOrderLines'
import { WorkOrderPDFDownloadButton } from './WorkOrderPDF'
import { WorkOrderInvoiceDownloadButton } from './WorkOrderInvoiceDownloadButton'
import { sendWorkOrderEmail } from '../lib/sendEmail'
import { sendInvoiceEmail } from '../lib/sendInvoiceEmail'

type Props = {
  rawOutput?: string
  initialLines?: RepairLine[]
  userId: string
  vehicleId: string
  workOrderId: string
  vehicleInfo?: {
    year?: string
    make?: string
    model?: string
    vin?: string
  }
  customerInfo?: {
    name?: string
    phone?: string
    email?: string
  }
}

export default function WorkOrderEditorPage({
  rawOutput,
  initialLines,
  userId,
  vehicleId,
  workOrderId,
  vehicleInfo,
  customerInfo,
}: Props) {
  const [lines, setLines] = useState<RepairLine[]>([])
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (initialLines) {
      setLines(initialLines)
    } else if (rawOutput) {
      const parsed = parseRepairOutput(rawOutput)
      setLines(parsed)
    }
  }, [initialLines, rawOutput])

  const handleSave = async () => {
    try {
      await saveWorkOrderLines(lines, userId, vehicleId, workOrderId)
      setSaved(true)
      setError(null)
    } catch (err: any) {
      console.error(err)
      setError(err.message)
      setSaved(false)
    }
  }

  const correctionSummary =
    lines.find((line) => line.complaint === 'General Repair Summary')?.correction || ''

  return (
    <div className="max-w-3xl mx-auto p-6 bg-surface text-accent shadow-card rounded space-y-6">
      <h2 className="text-xl font-semibold">Work Order Editor</h2>

      <WorkOrderLineEditor lines={lines} onChange={setLines} />

      <div className="flex gap-4 flex-wrap">
        <button
          onClick={handleSave}
          className="px-6 py-3 bg-primary text-white rounded hover:bg-primary-dark"
        >
          Save Work Order
        </button>

        <WorkOrderPDFDownloadButton
          vehicleId={vehicleId}
          workOrderId={workOrderId}
          lines={lines}
          summary={correctionSummary}
          vehicleInfo={vehicleInfo}
          customerInfo={customerInfo}
        />

        <WorkOrderInvoiceDownloadButton
          workOrderId={workOrderId}
          lines={lines}
          summary={correctionSummary}
          vehicleInfo={vehicleInfo}
          customerInfo={customerInfo}
        />

        <button
          onClick={async () => {
            try {
              await sendWorkOrderEmail({
                vehicleId,
                workOrderId,
                lines,
                summary: correctionSummary,
                vehicleInfo,
                customerInfo,
              })
              alert('📧 Work order email sent to customer!')
            } catch (err: any) {
              alert(`❌ Failed to send work order email: ${err.message}`)
            }
          }}
          className="px-6 py-3 bg-green-600 text-white rounded hover:bg-green-700"
        >
          Email Work Order
        </button>

        <button
          onClick={async () => {
            try {
              await sendInvoiceEmail({
                vehicleId,
                workOrderId,
                lines,
                summary: correctionSummary,
                vehicleInfo,
                customerInfo,
              })
              alert('📧 Invoice email sent to customer!')
            } catch (err: any) {
              alert(`❌ Failed to send invoice email: ${err.message}`)
            }
          }}
          className="px-6 py-3 bg-indigo-700 text-white rounded hover:bg-indigo-800"
        >
          Email Invoice
        </button>
      </div>

      {saved && <p className="text-green-500">✅ Work order saved</p>}
      {error && <p className="text-red-500">❌ {error}</p>}
    </div>
  )
}