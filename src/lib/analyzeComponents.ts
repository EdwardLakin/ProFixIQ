import { VehicleInfo } from '@/types/vehicle';

export async function analyzeImageComponents(
  imageURL: string,
  vehicle: VehicleInfo
): Promise<{ result?: string; error?: string }> {
  try {
    // Validate imageURL is a string and starts with https
    if (typeof imageURL !== 'string' || !imageURL.startsWith('https://')) {
      return { error: 'Invalid image URL. Must be a valid HTTPS URL.' };
    }

    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_url: imageURL,
        vehicle,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('Analyze API error:', errorText);
      return { error: 'Image analysis failed' };
    }

    const data = await res.json();
    return data;
  } catch (error: any) {
    console.error('analyzeImageComponents error:', error);
    return { error: 'Image analysis failed' };
  }
}