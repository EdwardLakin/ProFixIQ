import { OpenAIStream, StreamingTextResponse } from 'ai';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export const runtime = 'edge';

export async function POST(req: Request) {
  const { transcript } = await req.json();

  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    stream: true,
    messages: [
      {
        role: 'system',
        content: `
You are an AI assistant inside a vehicle inspection app. Your role is to listen to mechanic voice commands and convert them into structured inspection actions. These include:

1. Marking items as OK, FAIL, or N/A.
2. Updating a measurement value for an item (e.g., "Front left pad 5 millimeters").
3. Attaching notes to an item.
4. Adding photo evidence if required.
5. Completing or skipping an item.
6. Completing the full inspection.

Expected output format (JSON string only):

{
  "command": "update_status" | "update_value" | "add_note" | "complete_item" | "skip_item" | "complete_inspection",
  "section": "string",         // Optional
  "item": "string",            // Optional
  "status": "ok" | "fail" | "na", // If command is update_status
  "value": "string",           // If command is update_value
  "notes": "string"            // If command is add_note
}

Respond ONLY with a valid JSON string. Do not include explanations, greetings, or additional text.
      `,
      },
      {
        role: 'user',
        content: transcript,
      },
    ],
  });

  const stream = OpenAIStream(response);
  return new StreamingTextResponse(stream);
}