import { ChatCompletionMessageParam, OpenAI } from 'openai-edge'
import { Vehicle } from '@/types/vehicle'
import { formatTechBotPrompt } from './formatTechBotPrompt'

export async function askTechBot(vehicle: Vehicle, input: string): Promise<string> {
  const prompt = formatTechBotPrompt(vehicle, input)

  const messages: ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: `You are TechBot, a certified master technician AI that provides accurate and step-by-step diagnostics for automotive issues. Always tailor your response based on the user's selected vehicle and explain issues as clearly as possible. Avoid speculation. If you're unsure, prompt the user for more details or test results.`,
    },
    {
      role: 'user',
      content: prompt,
    },
  ]

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY!,
  })

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages,
  })

  const result = completion.choices?.[0]?.message?.content?.trim()
  return result || 'TechBot could not generate a response.'
}