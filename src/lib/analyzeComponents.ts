// src/lib/analyzeComponents.ts

export async function analyzeAutomotiveComponents(file: File): Promise<any> {
  const formData = new FormData()
  formData.append('file', file)

  const response = await fetch(`${process.env.NEXT_PUBLIC_ANALYZE_COMPONENTS_URL}`, {
    method: 'POST',
    body: formData,
  })

  if (!response.ok) {
    throw new Error('Component analysis failed')
  }

  const result = await response.json()
  return result
}