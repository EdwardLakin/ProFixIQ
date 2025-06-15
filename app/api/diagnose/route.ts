import { NextResponse } from 'next/server';
import { OpenAI } from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const { dtcCode, vehicle } = await req.json();

    if (!vehicle || !vehicle.year || !vehicle.make || !vehicle.model || !dtcCode) {
      return NextResponse.json({ error: 'Missing DTC code or vehicle info' }, { status: 400 });
    }

    const vehicleDesc = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
    const prompt = `
You are a highly skilled automotive technician. Provide a structured diagnosis for DTC code ${dtcCode} on a ${vehicleDesc}.

Format the response using these bolded markdown headers:

**DTC Code Summary:**  
Code: ${dtcCode}  
Meaning: (short description)  
Severity: (Low/Medium/High)  
Common causes: (list)

**Troubleshooting Steps:**  
(Step-by-step diagnostic process)

**Tools Required:**  
(List of tools or test equipment)

**Estimated Labor Time:**  
(Approximate time range)

Only return the structured response. Avoid adding explanations or disclaimers outside the format.
`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.5,
      messages: [
        {
          role: 'system',
          content: 'You are a top-level automotive diagnostic expert.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const reply = completion.choices?.[0]?.message?.content || 'No diagnosis returned.';
    return NextResponse.json({ result: reply });
  } catch (err) {
    console.error('AI Diagnose Error:', err);
    return NextResponse.json({ error: 'Failed to process DTC request.' }, { status: 500 });
  }
}