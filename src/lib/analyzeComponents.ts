export async function analyzeImage(
  imageFile: File,
  vehicle: Record<string, string>
): Promise<string | { error: string }> {
  try {
    const reader = new FileReader();
    const imageURL = await new Promise<string>((resolve, reject) => {
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => reject('Failed to read file as Data URL');
      reader.readAsDataURL(imageFile);
    });

    if (!imageURL.startsWith('data:image')) {
      return { error: 'Invalid image format. Must be an image file.' };
    }

    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: imageURL, vehicle }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      return { error: `Image analysis failed: ${errorText}` };
    }

    const data = await res.json();
    return data;
  } catch (err) {
    return { error: 'Image analysis failed' };
  }
}