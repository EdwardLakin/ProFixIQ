import { OpenAIStream, StreamingTextResponse }  from 'ai/responders';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
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
        content: `You are an AI assistant inside a vehicle inspection app. Your role is to listen to mechanic transcripts and turn them into JSON inspection commands.

Example:
  1. Marking items as OK, FAIL, or N/A.
  2. Adding a measurement value for an item (e.g., "Front left pad 5 millimeters").
  3. Attaching notes to an item.
  4. Recommending repair or item if required.
  5. Completing or skipping an item.
  6. Finishing or skipping the full inspection.

Expected output format (JSON string only):
{
  "command": "update_status" | "update_value" | "add_note" | "complete_item" | "skip_item",
  "section": "string",     // Optional
  "item": "string",        // Optional
  "status": "ok" | "fail" | "na",  // If command is update_status
  "value": "string",       // If command is update_value
  "notes": "string"        // If command is add_note
}

Respond ONLY with a valid JSON string. Do not include explanations or greetings.`,
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