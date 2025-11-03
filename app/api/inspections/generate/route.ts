// app/api/inspections/generate/route.ts
import "server-only";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import {
  buildFromMaster,
  type VehicleType,
  type BrakeSystem,
} from "@/features/inspections/lib/inspection/masterInspectionList";

/* ----------------------------- Types ----------------------------- */
type Status = "ok" | "fail" | "na" | "recommend";

type InspectionItem = {
  item?: string;
  name?: string;
  unit?: string | null;
  value?: string | number | null;
  notes?: string | null;
  status?: Status;
  photoUrls?: string[];
  recommend?: string[];
};

type InspectionSection = { title: string; items: InspectionItem[] };

export const runtime = "edge";

/* ------------------------- Type helpers -------------------------- */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/* ------------------------ Unit heuristics ------------------------ */
function unitHint(label: string): string | null {
  const l = label.toLowerCase();
  if (/(tread|pad|lining|rotor|drum|push ?rod|thickness)/.test(l)) return "mm";
  if (/(pressure|psi|kpa)/.test(l)) return l.includes("kpa") ? "kPa" : "psi";
  if (/(torque|ft·lb|ft-lb|nm|n·m)/.test(l)) return l.includes("n") ? "N·m" : "ft·lb";
  return null;
}

/* ---------------------- Sanitize AI sections --------------------- */
function sanitizeSimpleSections(input: unknown): Array<{ title: string; items: Array<{ item: string; unit?: string | null }> }> {
  const sectionsIn: unknown[] =
    isRecord(input) && Array.isArray((input as Record<string, unknown>).sections)
      ? ((input as Record<string, unknown>).sections as unknown[])
      : [];

  const clean: Array<{ title: string; items: Array<{ item: string; unit?: string | null }> }> = [];

  for (const sec of sectionsIn) {
    if (!isRecord(sec)) continue;
    const title = (asString(sec.title) ?? "").trim();
    if (!title) continue;

    const itemsIn: unknown[] = Array.isArray(sec.items) ? (sec.items as unknown[]) : [];
    const itemsOut: Array<{ item: string; unit: string | null }> = [];

    for (const raw of itemsIn) {
      if (!isRecord(raw)) continue;
      const label = (asString(raw.item) ?? asString(raw.name) ?? "").trim();
      if (!label) continue;
      const providedUnit = (asString(raw.unit) ?? "").trim();
      const unit = providedUnit || unitHint(label) || null;
      itemsOut.push({ item: label, unit });
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

/* -------------------- corner-ish detection (light) -------------------- */
function hasCornerishContent(sections: Array<{ title: string; items: Array<{ item: string }> }>): boolean {
  return sections.some(
    (s) =>
      /corner|axle|tire|wheel/i.test(s.title) ||
      s.items.some((i) => /tire|tread|pressure|pad|rotor|lining/i.test(i.item.toLowerCase()))
  );
}

function buildHydraulicCorner(): { title: string; items: Array<{ item: string; unit: string | null }> } {
  return {
    title: "Corner Grid (Hydraulic)",
    items: [
      { item: "LF Tire Pressure", unit: "psi" },
      { item: "RF Tire Pressure", unit: "psi" },
      { item: "LR Tire Pressure", unit: "psi" },
      { item: "RR Tire Pressure", unit: "psi" },
      { item: "LF Tire Tread", unit: "mm" },
      { item: "RF Tire Tread", unit: "mm" },
      { item: "LR Tire Tread", unit: "mm" },
      { item: "RR Tire Tread", unit: "mm" },
      { item: "LF Brake Pad Thickness", unit: "mm" },
      { item: "RF Brake Pad Thickness", unit: "mm" },
      { item: "LR Brake Pad Thickness", unit: "mm" },
      { item: "RR Brake Pad Thickness", unit: "mm" },
      { item: "LF Rotor Thickness", unit: "mm" },
      { item: "RF Rotor Thickness", unit: "mm" },
    ],
  };
}

function buildAirCorner(): { title: string; items: Array<{ item: string; unit: string | null }> } {
  return {
    title: "Corner Grid (Air)",
    items: [
      { item: "Steer 1 Left Tire Pressure", unit: "psi" },
      { item: "Steer 1 Right Tire Pressure", unit: "psi" },
      { item: "Steer 1 Left Tread Depth", unit: "mm" },
      { item: "Steer 1 Right Tread Depth", unit: "mm" },
      { item: "Drive 1 Left Tire Pressure Inner", unit: "psi" },
      { item: "Drive 1 Left Tire Pressure Outer", unit: "psi" },
      { item: "Drive 1 Right Tire Pressure Inner", unit: "psi" },
      { item: "Drive 1 Right Tire Pressure Outer", unit: "psi" },
      { item: "Drive 1 Left Tread Depth Inner", unit: "mm" },
      { item: "Drive 1 Left Tread Depth Outer", unit: "mm" },
      { item: "Drive 1 Right Tread Depth Inner", unit: "mm" },
      { item: "Drive 1 Right Tread Depth Outer", unit: "mm" },
    ],
  };
}

/* ------------------------------- Route ------------------------------- */
export async function POST(req: Request) {
  try {
    const { prompt, vehicleType } = (await req.json()) as {
      prompt: string;
      vehicleType?: VehicleType;
    };

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }

    // 1) infer vehicle + brake
    const vt: VehicleType =
      vehicleType ??
      (prompt.toLowerCase().includes("truck") || prompt.toLowerCase().includes("bus")
        ? "truck"
        : "car");

    const brake: BrakeSystem = vt === "car" ? "hyd_brake" : "air_brake";

    // 2) infer a target count from prompt (“60 point…”) or default 20
    const m = prompt.match(/(\d{2,3})\s*(point|pt)?/i);
    const targetCount = m ? parseInt(m[1]!, 10) : 20;

    // 3) deterministic base from your master list
    const baseSections = buildFromMaster({
      vehicleType: vt,
      brakeSystem: brake,
      targetCount,
    });

    // 4) call OpenAI — same pattern as your build-from-prompt route
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

    const system = [
      "You are an AI assistant for generating vehicle inspection templates.",
      "Return ONLY JSON with an array of sections.",
      "Each section has a title and a list of inspection items.",
      "Include units when obvious (psi, kPa, mm, in, ft·lb).",
      `Vehicle type: ${vt}.`,
      `Brake system: ${brake}.`,
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
      // @ts-expect-error not yet typed
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "SectionsOutput",
          schema: {
            type: "object",
            properties: {
              sections: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    items: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          item: { type: "string" },
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
        },
      },
      max_output_tokens: 4000,
    });

    // 5) extract JSON from Responses API
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

    const aiSectionsSimple = sanitizeSimpleSections(aiRaw);

    // 6) decide whether AI is “good enough” to merge
    const aiItemCount = aiSectionsSimple.reduce(
      (sum, s) => sum + (s.items?.length ?? 0),
      0
    );
    const minItemsToMerge = Math.max(10, Math.floor(targetCount * 0.5));
    const useAI = aiSectionsSimple.length >= 3 && aiItemCount >= minItemsToMerge;

    // 7) merge AI into base
    const mergedSimple = [...baseSections];
    if (useAI) {
      for (const aiSec of aiSectionsSimple) {
        const existing = mergedSimple.find(
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
          mergedSimple.push(aiSec);
        }
      }
    }

    // 8) make sure a corner grid exists
    if (!hasCornerishContent(mergedSimple)) {
      if (vt === "car") {
        mergedSimple.unshift(buildHydraulicCorner());
      } else {
        mergedSimple.unshift(buildAirCorner());
      }
    }

    // 9) map to your richer item shape so the existing UI doesn’t break
    const finalSections: InspectionSection[] = mergedSimple.map((sec) => ({
      title: sec.title,
      items: sec.items.map((it) => ({
        item: it.item,
        unit: it.unit ?? null,
        value: "",
        notes: "",
        status: "na",
        photoUrls: [],
      })),
    }));

    return NextResponse.json({ sections: finalSections });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("Generate failed:", e);
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}