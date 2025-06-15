type Vehicle = {
  year: string;
  make: string;
  model: string;
};

function isBase64(input: unknown): input is string {
  return typeof input === 'string' && input.startsWith('data:image');
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function analyzeImage(
  image: File | string,
  vehicle: Vehicle
) {
  const base64Image = isBase64(image) ? image : await toBase64(image);

  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: base64Image, vehicle }),
  });

  return res.json();
}