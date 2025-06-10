// src/lib/dtc.ts

export async function diagnoseDTC(vehicle: string, dtcCode: string): Promise<any> {
  const response = await fetch(`${process.env.NEXT_PUBLIC_DTC_DIAGNOSIS_URL}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      vehicle,
      dtcCode,
    }),
  })

  if (!response.ok) {
    throw new Error('DTC diagnosis failed')
  }

  const result = await response.json()
  return result
}