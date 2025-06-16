import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

type VehicleInfo = {
  year: string;
  make: string;
  model: string;
};

export async function askTechBot(prompt: string, vehicle?: VehicleInfo): Promise<string> {
  const messages = [
    {
      role: 'system',
      content: `You are an expert automotive diagnostic assistant.`,
    },
    {
      role: 'user',
      content: vehicle
        ? `Vehicle: ${vehicle.year} ${vehicle.make} ${vehicle.model}\n\n${prompt}`
        : prompt,
    },
  ];

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages,
    temperature: 0.7,
  });

  return response.choices[0]?.message.content?.trim() || 'No response.';
}

export async function diagnoseDTC(vehicle: VehicleInfo, code: string): Promise<string> {
  const messages = [
    {
      role: 'system',
      content: 'You are an expert diagnostic technician specializing in OBD-II codes.',
    },
    {
      role: 'user',
      content: `Vehicle: ${vehicle.year} ${vehicle.make} ${vehicle.model}\n\nDTC Code: ${code}\nPlease describe the code, severity, likely cause, and suggested fix.`,
    },
  ];

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages,
    temperature: 0.7,
  });

  return response.choices[0]?.message.content?.trim() || 'No response.';
}