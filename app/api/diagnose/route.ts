import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import { OpenAIStream, StreamingTextResponse } from 'ai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

export async function POST(req: Request) {
  try {
    const { prompt, dtc, vehicle } = await req.json()

    if (!vehicle || (!prompt && !dtc)) {
      return NextResponse.json(
        { error: 'Missing vehicle or query.' },
        { status: 400 }
      )
    }

    const vehicleInfo = `${vehicle.year} ${vehicle.make} ${vehicle.model}`

    const userPrompt = dtc
      ? `
You are diagnosing DTC code "${dtc}" on a ${vehicleInfo}.

Respond in this exact format using bold markdown headers (**Section:**) and line breaks:

**DTC Description:**  
[Explain what the code means]

**Severity:**  
[Low / Medium / High and why]

**Possible Causes:**  
- [Cause 1]  
- [Cause 2]

**Diagnostic Steps:**  
1. [Test 1]  
2. [Test 2]

**Recommended Fix:**  
[Final repair recommendation]
`
      : `
You are assisting with a diagnosis on a ${vehicleInfo}. The technician says: "${prompt}".

Respond in this format using bold markdown headers and clear line breaks:

**Issue Summary:**  
...

**Possible Causes:**  
- Cause 1  
- Cause 2

**Diagnostic Steps:**  
1. Step 1  
2. Step 2

**Next Actions:**  
...
`

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      stream: true,
      temperature: 0.4,
      messages: [
        {
          role: 'system',
          content:
            'You are a highly advanced diagnostic technician with deep expertise in drivability, electronics, and root cause analysis. Return clear, formatted, professional diagnostics using bold section headers (e.g. "**Diagnostic Steps:**") and bullet points. Avoid fluff. Be direct and useful.',
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    })

    const stream = OpenAIStream(response)
    return new StreamingTextResponse(stream)
  } catch (err: any) {
    console.error('Error in /api/diagnose:', err)
    return NextResponse.json(
      { error: 'Failed to process request.' },
      { status: 500 }
    )
  }
}