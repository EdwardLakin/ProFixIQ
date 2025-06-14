import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  dangerouslyAllowBrowser: true,
});

function convertToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}

export async function analyzeImageWithAI(imageFile: File, vehicle: { year: string; make: string; model: string }) {
  const base64Image = await convertToBase64(imageFile);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are an expert automotive technician. The user will upload a photo and tell you the vehicle details. Identify potential problems in the image, and recommend a likely cause and fix.`,
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `This is a ${vehicle.year} ${vehicle.make} ${vehicle.model}. What do you see in this photo?`,
          },
          {
            type: 'image_url',
            image_url: {
              url: base64Image,
            },
          },
        ],
      },
    ],
  });

  return response.choices[0].message.content;
}