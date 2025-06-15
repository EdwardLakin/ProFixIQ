export type AnalyzePayload = {
  image: File;
  vehicle: {
    year: string;
    make: string;
    model: string;
  };
};

export async function analyzeImageComponent(
  image: File,
  vehicle: { year: string; make: string; model: string }
): Promise<{ result?: string; error?: string }> {
  const toBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1]; // strip prefix
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  try {
    const base64Image = await toBase64(image);

    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: base64Image,
        vehicle,
      }),
    });

    const data = await res.json();
    return data;
  } catch (err) {
    console.error('analyzeImageComponent error:', err);
    return { error: 'Failed to analyze image' };
  }
}