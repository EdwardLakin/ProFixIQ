import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type CommandStatus = "ok" | "fail" | "na";

type VoiceCommand =
  | {
      command: "update_status";
      section?: string;
      item?: string;
      side?: "left" | "right";
      status: CommandStatus;
      note?: string;
      notes?: string;
    }
  | {
      command: "update_value";
      section?: string;
      item?: string;
      side?: "left" | "right";
      value: number | string;
      unit?: string;
      note?: string;
      notes?: string;
    }
  | {
      command: "add_note";
      section?: string;
      item?: string;
      side?: "left" | "right";
      note: string;
      notes?: string;
    }
  | {
      command: "recommend";
      section?: string;
      item?: string;
      side?: "left" | "right";
      note: string;
      notes?: string;
    }
  | {
      command: "add_part";
      section?: string;
      item?: string;
      side?: "left" | "right";
      partName: string;
      quantity?: number;
      note?: string;
      notes?: string;
    }
  | {
      command: "add_labor";
      section?: string;
      item?: string;
      side?: "left" | "right";
      hours: number;
      label?: string;
      note?: string;
      notes?: string;
    }
  | { command: "complete_item"; section?: string; item?: string; side?: "left" | "right" }
  | { command: "skip_item"; section?: string; item?: string; side?: "left" | "right" }
  | { command: "pause_inspection" }
  | { command: "finish_inspection" };

function safeJsonParseArray(input: string): VoiceCommand[] {
  try {
    const parsed = JSON.parse(input);
    return Array.isArray(parsed) ? (parsed as VoiceCommand[]) : [];
  } catch {
    return [];
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { transcript?: unknown } | null;
    const transcript = String(body?.transcript ?? "").trim();

    if (!transcript) {
      return NextResponse.json([]);
    }

    const systemPrompt = `
You are an AI assistant embedded in a vehicle inspection web app.

Your job is to convert mechanic voice transcripts into structured JSON commands that update inspection items on a form.

Rules:
- Return ONLY valid JSON (a JSON ARRAY). No markdown. No explanations.
- If unsure, return [].
- Fix common misheard phrases ("breaks" -> "brakes", "millimeter" -> "mm").
- Use synonyms: pass=ok, failed=fail, not applicable=na.
- If section/item not explicitly stated, you may omit them; the client will apply the command to the current focused item.
- Keep values concise and units normalized when possible.

Allowed commands (examples of shapes):
- update_status: {"command":"update_status","section?":"...","item?":"...","status":"ok"|"fail"|"na","note?":"..."}
- update_value:  {"command":"update_value","section?":"...","item?":"...","value":number|string,"unit?":"mm"|"in"|"psi"|"kPa"|"ft·lb"|"...","note?":"..."}
- add_note:      {"command":"add_note","section?":"...","item?":"...","note":"..."}
- recommend:     {"command":"recommend","section?":"...","item?":"...","note":"..."}
- add_part:      {"command":"add_part","section?":"...","item?":"...","partName":"...","quantity?":number}
- add_labor:     {"command":"add_labor","section?":"...","item?":"...","hours":number,"label?":"..."}
- pause_inspection: {"command":"pause_inspection"}
- finish_inspection: {"command":"finish_inspection"}
- complete_item: {"command":"complete_item","section?":"...","item?":"..."}
- skip_item:     {"command":"skip_item","section?":"...","item?":"..."}

Examples:
"techy mark right tie rod end as failed" =>
[{"command":"update_status","item":"Tie Rod End","side":"right","status":"fail"}]

"techy add measurement 8 millimeters for left front tire tread" =>
[{"command":"update_value","item":"Tread Depth","side":"left","value":8,"unit":"mm"}]

"yes add 1 hour labor and a tie rod end" =>
[{"command":"add_part","partName":"Tie Rod End","quantity":1},{"command":"add_labor","hours":1,"label":"Labor"}]
`.trim();

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: transcript },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "[]";

    // Hard requirement: we return an array (or [])
    const commands = safeJsonParseArray(raw);

    return NextResponse.json(commands);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[api/ai/interpret] error:", err);
    return NextResponse.json([]);
  }
}