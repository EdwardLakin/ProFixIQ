// src/lib/analyze.ts

type VehicleInfo = {
  year: string;
  make: string;
  model: string;
};

export async function diagnoseDTC(vehicle: VehicleInfo, code: string): Promise<string> {
  const res = await fetch('/api/diagnose', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      vehicle,
      code,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('DTC diagnose error:', errorText);
    throw new Error('Failed to diagnose DTC');
  }

  const data = await res.json();
  return data.result;
}