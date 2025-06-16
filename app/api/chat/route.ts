import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { formatTechBotPrompt } from '@/lib/formatTechBotPrompt'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(req: NextRequest) {
  try {
    const { vehicle, input } = await req.json()

    if (!vehicle || !input) {
      return NextResponse.json({ error: 'Missing vehicle or input' }, { status: 400 })
    }

    const prompt = formatTechBotPrompt(vehicle, input)

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
    })

    const message = completion.choices[0]?.message?.content
    return NextResponse.json({ result: message })
  } catch (error) {
    console.error('[TechBot Error]', error)
    return NextResponse.json({ error: 'Failed to contact TechBot' }, { status: 500 })
  }
}