export async function analyzeImage(file: File): Promise<unknown> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${process.env.NEXT_PUBLIC_ANALYZE_IMAGE_URL}`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error("Image analysis failed");
  }

  const result = await response.json();
  return result;
}