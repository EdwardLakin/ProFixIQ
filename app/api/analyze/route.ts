import { NextResponse } from 'next/server'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(req: Request) {
  try {
    const { image, vehicle } = await req.json()

    if (!image || !vehicle) {
      return NextResponse.json(
        { error: 'Missing image or vehicle info' },
        { status: 400 }
      )
    }

    const prompt = `
You are an expert automotive diagnostic technician. Based on the uploaded photo of the vehicle component and the vehicle details (Year: ${vehicle.year}, Make: ${vehicle.make}, Model: ${vehicle.model}), analyze what issue might be visible.

Give your answer in the following format:

**Visual Diagnosis**
- Main issue: [describe the problem]
- Severity: [low, moderate, high]
- Suggested repair: [what to do]
- Safety risk: [yes/no]

Be concise, clear, and accurate.
`

    const response = await openai.chat.completions.create({
      model: 'gpt-4-vision-preview',
      messages: [
        {
          role: 'system',
          content: 'You are a master automotive diagnostic technician.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: image } },
          ],
        },
      ],
      max_tokens: 1000,
    })

    const result = response.choices[0]?.message?.content

    return NextResponse.json({ result })
  } catch (err: any) {
    console.error('Error analyzing image:', err)
    return NextResponse.json({ error: 'Failed to analyze image' }, { status: 500 })
  }
}