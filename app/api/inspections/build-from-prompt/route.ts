import "server-only";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import {
  buildFromMaster,
  type VehicleType,
  type BrakeSystem,
} from "@/features/inspections/lib/inspection/masterInspectionList";

type DutyClass = "light" | "medium" | "heavy";

/* ------------------------------------------------------------------ */
/* Types & helpers                                                    */
/* ------------------------------------------------------------------ */

type SectionItem = { item: string; unit?: string | null };
type SectionOut = { title: string; items: SectionItem[] };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}
function unitHint(label: string): string | null {
  const l = label.toLowerCase();
  if (/(tread|pad|lining|rotor|drum|push ?rod|thickness)/.test(l)) return "mm";
  if (/(pressure|psi|kpa|leak rate|warning)/.test(l))
    return l.includes("kpa") ? "kPa" : "psi";
  if (/(torque|ft·lb|ft-lb|nm|n·m)/.test(l)) return l.includes("n") ? "N·m" : "ft·lb";
  return null;
}

/** model → safe SectionOut[] */
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
/* Air/HD detectors so cars don't get truck stuff                     */
/* ------------------------------------------------------------------ */

function looksAirBrakeItem(label: string): boolean {
  const l = label.toLowerCase();
  if (l.includes("push rod")) return true;
  if (l.includes("pushrod")) return true;
  if (l.includes("slack adjuster")) return true;
  if (l.includes("air tank")) return true;
  if (l.includes("air leak")) return true;
  if (l.includes("governor")) return true;
  if (/^(steer|drive|tag|trailer)\s*\d*\s+(left|right)\s+/i.test(label)) return true;
  return false;
}

function looksAirBrakeSection(title: string): boolean {
  const t = title.toLowerCase();
  return (
    t.includes("air brake") ||
    t.includes("axle") ||
    t.includes("corner grid (air)") ||
    t.includes("steer") ||
    t.includes("drive 1") ||
    t.includes("drive 2") ||
    t.includes("trailer") ||
    t.includes("fifth wheel")
  );
}

/** does the prompt sound like light-duty/automotive? */
function promptSaysAutomotive(p: string): boolean {
  const l = p.toLowerCase();
  return (
    l.includes("automotive") ||
    l.includes("car") ||
    l.includes("passenger") ||
    l.includes("light duty") ||
    l.includes("suv") ||
    l.includes("minivan")
  );
}

/** try to infer duty class from prompt text */
function inferDutyFromPrompt(p: string): DutyClass | null {
  const l = p.toLowerCase();
  if (l.includes("light duty") || l.includes("automotive") || l.includes("passenger")) {
    return "light";
  }
  if (l.includes("medium duty") || l.includes("class 5") || l.includes("class 6")) {
    return "medium";
  }
  if (l.includes("heavy duty") || l.includes("class 7") || l.includes("class 8")) {
    return "heavy";
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* JSON schema for Responses API                                      */
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
/* Route                                                              */
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
    const dutyClassStr = asString((body as Record<string, unknown>).dutyClass);
    const targetCountRaw = (body as Record<string, unknown>).targetCount;

    if (!prompt) {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }

    const promptIsAuto = promptSaysAutomotive(prompt);

    // 1) infer vehicle / brake — prompt wins if it says automotive
    let vehicleType: VehicleType;
    if (promptIsAuto) {
      vehicleType = "car";
    } else if (vehicleTypeStr) {
      vehicleType = vehicleTypeStr as VehicleType;
    } else {
      vehicleType =
        prompt.toLowerCase().includes("truck") ||
        prompt.toLowerCase().includes("bus") ||
        prompt.toLowerCase().includes("trailer") ||
        prompt.toLowerCase().includes("hd") ||
        prompt.toLowerCase().includes("heavy duty")
          ? "truck"
          : "car";
    }

    // 2) infer duty class (body > prompt > vehicle fallback)
    let dutyClass: DutyClass;
    if (dutyClassStr === "light" || dutyClassStr === "medium" || dutyClassStr === "heavy") {
      dutyClass = dutyClassStr;
    } else {
      const fromPrompt = inferDutyFromPrompt(prompt);
      if (fromPrompt) {
        dutyClass = fromPrompt;
      } else {
        // fallback by vehicle
        if (vehicleType === "car") dutyClass = "light";
        else dutyClass = "heavy";
      }
    }

    // 3) infer brake system (hyd = light/auto, air = HD)
    let brakeSystem: BrakeSystem;
    if (promptIsAuto) {
      brakeSystem = "hyd_brake";
    } else if (brakeSystemStr) {
      brakeSystem = brakeSystemStr as BrakeSystem;
    } else {
      // if user explicitly asked for light but truck vehicleType, keep hyd
      if (dutyClass === "light") {
        brakeSystem = "hyd_brake";
      } else {
        brakeSystem = vehicleType === "car" ? "hyd_brake" : "air_brake";
      }
    }

    // 4) target size
    let targetCount: number;
    if (typeof targetCountRaw === "number" && targetCountRaw > 0) {
      targetCount = targetCountRaw;
    } else {
      const m = prompt.match(/(\d{2,3})\s*(point|pt)?/i);
      targetCount = m ? parseInt(m[1]!, 10) : 20;
    }

    // 5) deterministic base — now aware of duty class
    const baseSections = buildFromMaster({
      vehicleType,
      brakeSystem,
      targetCount,
      // ⬇️ this is the new field you added in masterInspectionList.ts
      dutyClass,
    } as any);

    // If no OpenAI, return base
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ sections: baseSections }, { status: 200 });
    }

    // 6) try to augment with OpenAI
    let aiSections: SectionOut[] = [];
    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

      const system = [
        "You are an AI assistant for generating vehicle inspection templates.",
        dutyClass === "light" || brakeSystem === "hyd_brake"
          ? "This is a light-duty / automotive inspection. Do NOT include heavy-duty truck or air-brake items such as push rod travel, slack adjusters, axle-by-axle dual tire rows, 5th wheel, or trailer air supply."
          : dutyClass === "medium"
          ? "This is a medium-duty inspection. Prefer hydraulic/light-truck items, but medium truck chassis/suspension/steering items are OK. Avoid HD tractor-only items like fifth wheel unless the prompt explicitly asks."
          : "This inspection may include heavy-duty / air-brake content.",
        "Return ONLY JSON that follows the supplied schema.",
        `Aim for about ${targetCount} inspection items.`,
      ].join(" ");

      const user = [
        `Prompt: ${prompt}`,
        `Vehicle type: ${vehicleType}`,
        `Duty class: ${dutyClass}`,
        "Generate inspection sections and items suitable for a professional repair shop.",
      ].join("\n");

      const resp = await openai.responses.create({
        model: "gpt-4o-mini",
        input: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        // @ts-expect-error - sdk typing lag
        response_format: {
          type: "json_schema",
          json_schema: SectionsSchema,
        },
        max_output_tokens: 4000,
      });

      // extract JSON
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

      aiSections = sanitizeSections(aiRaw);
    } catch (err) {
      console.error("OpenAI augmentation failed, returning base only:", err);
      return NextResponse.json({ sections: baseSections }, { status: 200 });
    }

    // 7) if this is light-duty, strip HD/air stuff from AI
    if (dutyClass === "light" || brakeSystem === "hyd_brake") {
      aiSections = aiSections
        .map((sec) => {
          if (looksAirBrakeSection(sec.title)) return null;
          const filteredItems = sec.items.filter(
            (it) => !looksAirBrakeItem(it.item),
          );
          if (!filteredItems.length) return null;
          return { ...sec, items: filteredItems };
        })
        .filter(Boolean) as SectionOut[];
    }

    // 8) merge if AI is good enough
    const aiItemCount = aiSections.reduce(
      (sum, s) => sum + (s.items?.length ?? 0),
      0,
    );
    const minItemsToMerge = Math.max(10, Math.floor(targetCount * 0.5));
    const shouldMerge = aiSections.length >= 3 && aiItemCount >= minItemsToMerge;

    const merged = [...baseSections];
    if (shouldMerge) {
      for (const aiSec of aiSections) {
        const existing = merged.find(
          (s) => s.title.toLowerCase() === aiSec.title.toLowerCase(),
        );
        if (existing) {
          const seen = new Set(existing.items.map((i) => i.item.toLowerCase()));
          for (const it of aiSec.items) {
            const key = it.item.toLowerCase();
            if (!seen.has(key)) {
              existing.items.push(it);
            }
          }
        } else {
          merged.push(aiSec);
        }
      }
    }

    return NextResponse.json({ sections: merged }, { status: 200 });
  } catch (err) {
    console.error("build-from-prompt route failed:", err);
    return NextResponse.json(
      {
        sections: [
          {
            title: "General",
            items: [{ item: "Visual walkaround", unit: null }],
          },
        ],
      },
      { status: 200 },
    );
  }
}