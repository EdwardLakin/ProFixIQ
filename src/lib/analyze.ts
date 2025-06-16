// lib/analyze.ts

import { VehicleInfo } from '@/types/vehicle';

export async function analyzeWithTechBot({
  vehicle,
  prompt,
}: {
  vehicle: VehicleInfo;
  prompt: string;
}) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vehicle, prompt }),
  });

  if (!res.ok) {
    const error = await res.text();
    console.error('TechBot API error:', error);
    return { error: 'AI response failed.' };
  }

  const data = await res.json();
  return data;
}

export async function diagnoseDTC(vehicle: VehicleInfo, dtcCode: string) {
  const res = await fetch('/api/diagnose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vehicle, dtc: dtcCode }),
  });

  if (!res.ok) {
    const error = await res.text();
    console.error('DTC Diagnose API error:', error);
    return { error: 'AI DTC diagnosis failed.' };
  }

  const data = await res.json();
  return data;
}