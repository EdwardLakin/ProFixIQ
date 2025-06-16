import { VehicleInfo } from '@/types/vehicle';

export async function analyzeWithTechBot(prompt: string, vehicle: VehicleInfo) {
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: prompt,
        vehicle,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('TechBot API error:', errorText);
      return { error: 'TechBot failed to respond.' };
    }

    const data = await res.json();
    return data;
  } catch (error) {
    console.error('TechBot fetch error:', error);
    return { error: 'TechBot is currently unavailable.' };
  }
}