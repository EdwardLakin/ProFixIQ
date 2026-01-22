import OpenAI from "openai";
import { NextResponse } from "next/server";

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
    }
  | {
      command: "update_value";
      section?: string;
      item?: string;
      side?: "left" | "right";
      value: number | string;
      unit?: string;
      note?: string;
    }
  | {
      command: "add_note";
      section?: string;
      item?: string;
      side?: "left" | "right";
      note: string;
    }
  | {
      command: "add_part";
      section?: string;
      item?: string;
      side?: "left" | "right";
      partName: string;
      quantity?: number;
    }
  | {
      command: "add_labor";
      section?: string;
      item?: string;
      side?: "left" | "right";
      hours: number;
      label?: string;
    }
  | {
      command: "add_recommended_line";
      label: string; // e.g. "Alignment"
      hours?: number;
      note?: string;
    }
  | {
      command: "finish_inspection";
    }
  | {
      command: "pause_inspection";
    };

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
    const form = await req.formData();
    const file = form.get("audio");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Missing audio file field 'audio'." },
        { status: 400 },
      );
    }

    // 1) Transcribe audio (speech -> text)
    const transcription = await openai.audio.transcriptions.create({
      // Recommended STT model per OpenAI docs/changelog.
      model: "gpt-4o-mini-transcribe",
      file,
    });

    const transcript = (transcription.text ?? "").trim();

    if (!transcript) {
      return NextResponse.json({ transcript: "", commands: [] satisfies VoiceCommand[] });
    }

    // 2) Convert transcript -> strict JSON commands
    const systemPrompt = `
You are "Techy", a voice copilot inside a heavy-duty vehicle inspection app.

Convert the mechanic transcript into a JSON array of commands to update an inspection.

Important rules:
- Output ONLY valid JSON (an array). No markdown, no explanation.
- If unsure what the user meant, output [].
- Fix common mishears: breaks->brakes, steer->steer 1, psi/pounds, mm/millimeter, etc.
- The mechanic can speak in any order. Do NOT assume a step-by-step flow.
- Prefer targeted updates: "right tie rod end" should target side:"right" and item:"Tie Rod End" when possible.

Command types you may emit:
1) update_status: {command:"update_status", section?, item?, side?, status:"ok"|"fail"|"na", note?}
2) update_value:  {command:"update_value",  section?, item?, side?, value:number|string, unit?, note?}
3) add_note:      {command:"add_note",      section?, item?, side?, note:string}
4) add_part:      {command:"add_part",      section?, item?, side?, partName:string, quantity?}
5) add_labor:     {command:"add_labor",     section?, item?, side?, hours:number, label?}
6) add_recommended_line:
   {command:"add_recommended_line", label:string, hours?, note?}
7) pause_inspection: {command:"pause_inspection"}
8) finish_inspection:{command:"finish_inspection"}

Examples:
- "techy mark right tie rod end as failed" =>
  [{"command":"update_status","item":"Tie Rod End","side":"right","status":"fail"}]

- "add right tie rod end and 1.0 hour labor" =>
  [{"command":"add_part","item":"Tie Rod End","side":"right","partName":"Right Tie Rod End","quantity":1},
   {"command":"add_labor","item":"Tie Rod End","side":"right","hours":1.0}]

- "also add an alignment" =>
  [{"command":"add_recommended_line","label":"Alignment","hours":1.0}]
`.trim();

    const completion = await openai.chat.completions.create({
      // Use your preferred fast text model here.
      model: "gpt-4.1-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: transcript },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim() ?? "[]";

    // Because response_format json_object returns an object, we accept either:
    // - [] directly
    // - {"commands":[...]}
    let commands: VoiceCommand[] = [];
    if (raw.startsWith("[")) {
      commands = safeJsonParseArray(raw);
    } else {
      try {
        const obj = JSON.parse(raw) as { commands?: unknown };
        commands = Array.isArray(obj.commands) ? (obj.commands as VoiceCommand[]) : [];
      } catch {
        commands = [];
      }
    }

    return NextResponse.json({ transcript, commands });
  } catch (err) {
    console.error("[api/voice/run] error:", err);
    return NextResponse.json({ transcript: "", commands: [] }, { status: 200 });
  }
}