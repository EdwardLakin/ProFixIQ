export async function sendInvoiceEmail({
  vehicleId,
  workOrderId,
  lines,
  summary,
  vehicleInfo,
  customerInfo,
}: {
  vehicleId: string
  workOrderId: string
  lines: any[]
  summary?: string
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
}) {
  const res = await fetch(
    'https://jaqjlyhvyofjvtwaeurr.supabase.co/functions/v1/send-invoice-email',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        vehicleId,
        workOrderId,
        lines,
        summary,
        vehicleInfo,
        customerInfo,
      }),
    }
  )

  if (!res.ok) throw new Error('Failed to send invoice email')

  return await res.json()
}