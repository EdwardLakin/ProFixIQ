// src/lib/analyzeComponents.ts

import { VehicleInfo } from '@/types/vehicle';

export async function analyzeImage(imageUrl: string, vehicle: VehicleInfo): Promise<{ result: string }> {
  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image: imageUrl,
        vehicle,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('analyzeImage error:', errorText);
      throw new Error('Image analysis failed');
    }

    const data = await res.json();
    return data;
  } catch (error: any) {
    console.error('Image analysis error:', error);
    return { result: 'Error: Image analysis failed.' };
  }
}