export async function analyzeImageComponents(
  imageFile: File,
  vehicle: Record<string, string>
): Promise<{ result?: string; error?: string }> {
  try {
    const reader = new FileReader();
    const imageURL = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject('Failed to read file as Data URL');
      reader.readAsDataURL(imageFile);
    });

    if (!imageURL.startsWith('data:image')) {
      return { error: 'Invalid image format. Must be an image file.' };
    }

    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageURL, vehicle }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      return { error: `Image analysis failed: ${errorText}` };
    }

    const data = await res.json();
    return data;
  } catch (error) {
    return { error: 'Image analysis failed' };
  }
}