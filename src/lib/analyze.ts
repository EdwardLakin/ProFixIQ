import { OpenAIStream } from './openaiStream';

export const analyzeImage = async (
  base64Image: string,
  vehicle: string
): Promise<string> => {
  const prompt = `Analyze the following image for vehicle issues. The vehicle is a ${vehicle}. Provide a diagnostic summary and any detected problems.`;

  const response = await OpenAIStream({
    model: 'gpt-4o-vision-preview',
    messages: [
      {
        role: 'system',
        content: 'You are a visual vehicle diagnostics expert. Describe problems clearly and concisely.'
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          {
            type: 'image_url',
            image_url: {
              url: base64Image,
              detail: 'high'
            }
          }
        ]
      }
    ],
    temperature: 0.7
  });

  return response;
};
