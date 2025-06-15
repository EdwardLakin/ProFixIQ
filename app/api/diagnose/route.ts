import { NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(req: Request) {
  try {
    const { dtc, prompt, vehicle } = await req.json()

    const userPrompt = prompt || `Explain how to diagnose and fix this DTC: ${dtc}`

    const fullPrompt = `
Vehicle: ${vehicle?.year} ${vehicle?.make} ${vehicle?.model}
Request: ${userPrompt}

Provide a clear explanation of the issue and recommended steps to fix it.
`

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are an expert automotive technician.' },
        { role: 'user', content: fullPrompt },
      ],
      temperature: 0.5,
    })

    const result = response.choices[0].message.content
    return NextResponse.json({ result })
  } catch (error) {
    console.error('TechBot Error:', error)
    return NextResponse.json({ error: 'TechBot failed to respond.' }, { status: 500 })
  }
}