import { OpenAI } from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

type VehicleInfo = {
  year: string;
  make: string;
  model: string;
};

export async function analyzePrompt({
  prompt,
  vehicle,
  mode = 'general',
}: {
  prompt: string;
  vehicle: VehicleInfo;
  mode?: 'general' | 'dtc';
}) {
  const vehicleString = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;

  const systemPrompt =
    mode === 'dtc'
      ? `
You are a highly experienced automotive technician specializing in diagnostics.
The user will give you a Diagnostic Trouble Code (DTC) and a vehicle (${vehicleString}).
Return a well-structured breakdown including:

**Code Meaning:** Explain what the code stands for.

**Severity:** How critical is it? Can the vehicle still be driven?

**Common Causes:** List the most likely root causes.

**Diagnostic Steps:** Guide the user through diagnosis using tools like multimeters, scan tools, or pressure gauges.

**Fixes:** List possible fixes with estimated labor time and parts that might be needed.

Be brief but detailed. Write in a format readable on mobile. Use **bold headers**.
`
      : `
You are a highly skilled automotive technician. The user is asking a question about a specific vehicle: ${vehicleString}.
Answer clearly and concisely. Include diagnostic steps, safety warnings, estimated labor time, and recommended tools where applicable.
Avoid generic responses. Be direct and mechanical in tone. Assume the user is experienced unless they ask for beginner steps.
`;

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: systemPrompt.trim(),
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  return completion.choices[0].message.content || '';
}