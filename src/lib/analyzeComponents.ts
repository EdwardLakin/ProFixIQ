'use client';

import { VehicleInfo } from '@/types/vehicle';

export async function analyzeImageComponents(
  imageUrl: string,
  vehicle: VehicleInfo
): Promise<{ result?: string; error?: string }> {
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

    const data = await res.json();
    return data;
  } catch (error: any) {
    console.error('analyzeImageComponents error:', error);
    return { error: 'Image analysis failed' };
  }
}