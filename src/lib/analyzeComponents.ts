export async function analyzeComponents(base64Image: string, vehicleInfo: any) {
  const response = await fetch('/api/diagnose', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image: base64Image,
      vehicle: vehicleInfo,
    }),
  });

  if (!response.ok) {
    throw new Error('Image analysis failed');
  }

  const result = await response.json();
  return result;
}