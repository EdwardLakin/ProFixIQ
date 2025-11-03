// app/api/inspections/build-from-prompt/route.ts
import "server-only";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import {
  buildFromMaster,
  type VehicleType,
  type BrakeSystem,
} from "@/features/inspections/lib/inspection/masterInspectionList";

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */

type SectionItem = { item: string; unit?: string | null };
type SectionOut = { title: string; items: SectionItem[] };

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function unitHint(label: string): string | null {
  const l = label.toLowerCase();
  if (/(tread|pad|lining|rotor|drum|push ?rod)/.test(l)) return "mm";
  if (/(pressure|psi|kpa|leak rate|warning)/.test(l))
    return l.includes("kpa") ? "kPa" : "psi";
  if (/(torque|ft·lb|ft-lb|nm|n·m)/.test(l)) return l.includes("n") ? "N·m" : "ft·lb";
  return null;
}

/** normalize whatever the model gives us into SectionOut[] */
function sanitizeSections(input: unknown): SectionOut[] {
  const sectionsIn: unknown[] =
    isRecord(input) && Array.isArray((input as Record<string, unknown>).sections)
      ? ((input as Record<string, unknown>).sections as unknown[])
      : [];

  const clean: SectionOut[] = [];

  for (const sec of sectionsIn) {
    if (!isRecord(sec)) continue;

    const title = asString(sec.title)?.trim() ?? "";
    if (!title) continue;

    const itemsIn: unknown[] = Array.isArray(sec.items) ? (sec.items as unknown[]) : [];
    const itemsOut: SectionItem[] = [];

    for (const raw of itemsIn) {
      if (!isRecord(raw)) continue;

      const label =
        asString(raw.item)?.trim() ??
        asString(raw.name)?.trim() ??
        "";

      if (!label) continue;

      const providedUnit = asString(raw.unit)?.trim();
      const unit = providedUnit && providedUnit.length > 0 ? providedUnit : unitHint(label);

      itemsOut.push({ item: label, unit: unit ?? null });
    }

    if (itemsOut.length) clean.push({ title, items: itemsOut });
  }

  // fallback so UI never explodes
  if (!clean.length) {
    return [
      {
        title: "General",
        items: [
          { item: "Visual walkaround", unit: null },
          { item: "Record warning lights", unit: null },
        ],
      },
    ];
  }

  return clean;
}

/* ------------------------------------------------------------------ */
/* JSON Schema for Responses API                                      */
/* ------------------------------------------------------------------ */

const SectionsSchema = {
  name: "SectionsOutput",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      sections: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string", minLength: 1 },
            items: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  item: { type: "string", minLength: 1 },
                  unit: { type: ["string", "null"] },
                },
                required: ["item"],
              },
            },
          },
          required: ["title", "items"],
        },
      },
    },
    required: ["sections"],
  },
} as const;

export const runtime = "edge";

/* ------------------------------------------------------------------ */
/* Route handler                                                      */
/* ------------------------------------------------------------------ */

export async function POST(req: Request) {
  try {
    const body: unknown = await req.json();
    if (!isRecord(body)) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const prompt = asString(body.prompt);
    const vehicleTypeStr = asString(body.vehicleType);
    const brakeSystemStr = asString(body.brakeSystem);
    const targetCountRaw = (body as Record<string, unknown>).targetCount;

    if (!prompt) {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }

    // 1) figure out vehicle / brake
    const vehicleType: VehicleType =
      (vehicleTypeStr as VehicleType) ??
      (prompt.toLowerCase().includes("truck") || prompt.toLowerCase().includes("bus")
        ? "truck"
        : "car");

    const brakeSystem: BrakeSystem =
      (brakeSystemStr as BrakeSystem) ??
      (vehicleType === "car" ? "hyd_brake" : "air_brake");

    // 2) adaptive target:
    // - explicit target wins
    // - else try to read a number from the prompt ("60 point", "50pt")
    // - else default to 20
    let targetCount: number;

    if (typeof targetCountRaw === "number" && targetCountRaw > 0) {
      targetCount = targetCountRaw;
    } else {
      const m = prompt.match(/(\d{2,3})\s*(point|pt)?/i);
      if (m) {
        targetCount = parseInt(m[1]!, 10);
      } else {
        targetCount = 20;
      }
    }

    // 3) deterministic seed
    const baseSections = buildFromMaster({
      vehicleType,
      brakeSystem,
      targetCount,
    });

    // 4) call OpenAI
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

    const system = [
      "You are an AI assistant for generating vehicle inspection templates.",
      "Return ONLY JSON that follows the supplied schema.",
      "Output several sections that match real shop inspections.",
      "Include units when obvious (psi, kPa, mm, in, ft·lb).",
      `Vehicle type: ${vehicleType}.`,
      `Brake system: ${brakeSystem}.`,
      `Aim for about ${targetCount} inspection items.`,
    ].join(" ");

    const user = [
      `Prompt: ${prompt}`,
      "Generate inspection sections and items suitable for a professional repair shop.",
    ].join("\n");

    const resp = await openai.responses.create({
      model: "gpt-4o-mini",
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-expect-error response_format not yet typed in 5.18.1
      response_format: {
        type: "json_schema",
        json_schema: SectionsSchema,
      },
      max_output_tokens: 4000,
    });

    // 5) extract JSON safely
    let aiRaw: unknown = {};
    type ResponseOutput = {
      type?: string;
      content?: Array<{ type?: string; output_json?: unknown; text?: string }>;
    };

    const firstOut = (resp.output?.[0] ?? {}) as ResponseOutput;
    if (firstOut.type === "message" && Array.isArray(firstOut.content)) {
      const c0 = firstOut.content[0];
      if (c0?.type === "output_json") {
        aiRaw = c0.output_json;
      } else if (c0?.type === "text" && typeof c0.text === "string") {
        try {
          aiRaw = JSON.parse(c0.text);
        } catch {
          aiRaw = {};
        }
      }
    }

    const aiSections = sanitizeSections(aiRaw);

    // 6) decide if AI is good enough to merge
    const aiItemCount = aiSections.reduce(
      (sum, s) => sum + (s.items?.length ?? 0),
      0
    );
    const minItemsToMerge = Math.max(10, Math.floor(targetCount * 0.5)); // half of target, but at least 10
    const useAI = aiSections.length >= 3 && aiItemCount >= minItemsToMerge;

    // 7) merge & dedupe
    const merged = [...baseSections];
    if (useAI) {
      for (const aiSec of aiSections) {
        const existing = merged.find(
          (s) => s.title.toLowerCase() === aiSec.title.toLowerCase()
        );
        if (existing) {
          const seen = new Set(existing.items.map((i) => i.item.toLowerCase()));
          for (const it of aiSec.items) {
            if (!seen.has(it.item.toLowerCase())) {
              existing.items.push(it);
            }
          }
        } else {
          merged.push(aiSec);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      prompt,
      vehicleType,
      brakeSystem,
      targetCount,
      sectionCount: merged.length,
      itemCount: merged.reduce((sum, s) => sum + (s.items?.length ?? 0), 0),
      sections: merged,
      usedAI: useAI,
    });
  } catch (e) {
    console.error("Build from prompt failed:", e);
    return NextResponse.json({ error: "Build failed" }, { status: 500 });
  }
}