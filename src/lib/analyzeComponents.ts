// lib/analyzeComponents.ts

import { VehicleInfo } from '@/types'
import { createBrowserClient } from '@supabase/ssr'

const supabase = createBrowserClient()

export async function analyzeImageComponents({
  imageUrl,
  vehicleInfo,
}: {
  imageUrl: string
  vehicleInfo: VehicleInfo
}): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token

  const res = await fetch('/api/analyze/image', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      imageUrl,
      vehicleInfo,
    }),
  })

  if (!res.ok) {
    throw new Error('Failed to analyze image.')
  }

  const json = await res.json()
  return json.result || 'No issues detected.'
}