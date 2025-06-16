import { VehicleInfo } from '@/types/vehicle';

export async function analyzeImageComponents(
  imageFile: File,
  vehicle: VehicleInfo
): Promise<{ result?: string; error?: string }> {
  try {
    // Convert file to Data URL
    const reader = new FileReader();

    const imageURL: string = await new Promise((resolve, reject) => {
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject('Failed to read file as Data URL');
      reader.readAsDataURL(imageFile);
    });

    // Validate it's a base64 image string
    if (!imageURL.startsWith('data:image')) {
      return { error: 'Invalid image format. Must be an image file.' };
    }

    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ image_url: imageURL, vehicle }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('Analyze API error:', errorText);
      return { error: 'Image analysis failed' };
    }

    const data = await res.json();
    return data;
  } catch (error) {
    console.error('analyzeImageComponents error:', error);
    return { error: 'Image analysis failed' };
  }
}