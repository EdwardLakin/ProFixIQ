import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function mapCsvColumns(headers: string[]): Promise<Record<string, string>> {
  const prompt = `
You are a helpful assistant for mapping spreadsheet headers to structured database fields. 
Match each header to the most appropriate database field from this list:

["customer_name", "email", "phone_number", "address", "city", "province", "postal_code", "vehicle_vin", "vehicle_year", "vehicle_make", "vehicle_model", "vehicle_plate", "vehicle_mileage"]

Return a JSON object where keys are original headers and values are the mapped fields.

Headers:
${headers.join(', ')}

JSON:
`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.1,
  });

  const content = response.choices[0].message.content;
  return JSON.parse(content ?? '{}');
}