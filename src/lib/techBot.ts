// src/lib/techBot.ts

export async function askTechBot(prompt: string, vehicle?: string): Promise<string> {
  const response = await fetch(`${process.env.NEXT_PUBLIC_ASK_SNAPFIX_AI_URL}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt,
      vehicle,
    }),
  })

  if (!response.ok) {
    throw new Error('TechBot request failed')
  }

  const result = await response.json()
  return result.answer || 'No response received.'
}