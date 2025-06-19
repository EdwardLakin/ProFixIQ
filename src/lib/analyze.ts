import { VehicleInfo } from '@/types/vehicle';

export async function diagnoseDTC(
  vehicle: VehicleInfo,
  dtcCode: string,
  context?: string
): Promise<{ result?: string; error?: string }> {
  try {
    const res = await fetch('/api/dtc/diagnose', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        vehicle,
        dtcCode,
        context, // <-- attach optional follow-up context
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('DTC Diagnose API Error:', errorText);
      return { error: 'DTC analysis failed.' };
    }

    const data = await res.json();
    return data;
  } catch (error) {
    console.error('diagnoseDTC handler error:', error);
    return { error: 'DTC request failed.' };
  }
}