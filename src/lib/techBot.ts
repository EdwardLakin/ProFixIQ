// src/lib/techBot.ts

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
    body: JSON.stringify({
      vehicle,
      prompt,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('TechBot API error:', errorText);
    return { error: 'AI response failed.' };
  }

  const data = await res.json();
  return data;
}

export async function diagnoseDTC(vehicle: VehicleInfo, dtc: string) {
  const res = await fetch('/api/diagnose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vehicle,
      dtc,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('DTC API error:', errorText);
    return { error: 'DTC API failed.' };
  }

  const data = await res.json();
  return data;
}