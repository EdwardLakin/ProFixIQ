// app/api/inspections/build-from-prompt/route.ts (FULL FILE REPLACEMENT)
import "server-only";
import { NextResponse } from "next/server";
import OpenAI from "openai";
import {
  buildFromMaster,
  type VehicleType,
  type BrakeSystem,
  type CvipGroup,
  type DutyClass,
} from "@/features/inspections/lib/inspection/masterInspectionList";

/* ------------------------------------------------------------------ */
/* Types & helpers                                                    */
/* ------------------------------------------------------------------ */

type SectionItem = { item: string; unit: string | null };
type SectionOut = { title: string; items: SectionItem[] };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function isVehicleType(v: unknown): v is VehicleType {
  return v === "car" || v === "truck" || v === "bus" || v === "trailer";
}

function isBrakeSystem(v: unknown): v is BrakeSystem {
  return v === "hyd_brake" || v === "air_brake";
}

function isDutyClass(v: unknown): v is DutyClass {
  return v === "light" || v === "medium" || v === "heavy";
}

function isCvipGroup(v: unknown): v is CvipGroup {
  return (
    v === "cvip_truck_air" ||
    v === "cvip_truck_hyd" ||
    v === "cvip_trailer_air" ||
    v === "cvip_trailer_hyd" ||
    v === "cvip_bus_air" ||
    v === "cvip_bus_hyd" ||
    v === "cvip_coach_air" ||
    v === "cvip_coach_hyd"
  );
}

function unitHint(label: string): string | null {
  const l = label.toLowerCase();
  if (/(tread|pad|lining|rotor|drum|push ?rod|thickness)/.test(l)) return "mm";
  if (/(pressure|psi|kpa|leak rate|warning)/.test(l))
    return l.includes("kpa") ? "kPa" : "psi";
  if (/(torque|ft·lb|ft-lb|nm|n·m)/.test(l))
    return l.includes("n") ? "N·m" : "ft·lb";
  return null;
}

/** model → safe SectionOut[] */
function sanitizeSections(input: unknown): SectionOut[] {
  const sectionsIn: unknown[] =
    isRecord(input) && Array.isArray(input.sections) ? input.sections : [];

  const clean: SectionOut[] = [];

  for (const sec of sectionsIn) {
    if (!isRecord(sec)) continue;
    const title = asString(sec.title)?.trim() ?? "";
    if (!title) continue;

    const itemsIn: unknown[] = Array.isArray(sec.items) ? sec.items : [];
    const itemsOut: SectionItem[] = [];

    for (const raw of itemsIn) {
      if (!isRecord(raw)) continue;
      const label =
        asString(raw.item)?.trim() ?? asString(raw.name)?.trim() ?? "";
      if (!label) continue;

      const providedUnit = asString(raw.unit)?.trim() ?? "";
      const unit =
        providedUnit.length > 0 ? providedUnit : unitHint(label) ?? null;

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

/* ------------------------------------------------------------------ */
/* Prompt heuristics                                                  */
/* ------------------------------------------------------------------ */

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

function inferDutyFromPrompt(p: string): DutyClass | null {
  const l = p.toLowerCase();
  if (l.includes("light duty") || l.includes("automotive") || l.includes("passenger"))
    return "light";
  if (l.includes("medium duty") || l.includes("class 5") || l.includes("class 6"))
    return "medium";
  if (l.includes("heavy duty") || l.includes("class 7") || l.includes("class 8"))
    return "heavy";
  return null;
}

function inferCvipGroupFromPrompt(p: string): CvipGroup | null {
  const l = p.toLowerCase();

  // Only infer if the prompt is explicitly CVIP-ish; otherwise leave null.
  const mentionsCvip =
    l.includes("cvip") ||
    l.includes("commercial vehicle inspection") ||
    l.includes("alberta inspection");

  if (!mentionsCvip) return null;

  const isTrailer = l.includes("trailer") || l.includes("dolly");
  const isBus = l.includes("bus");
  const isCoach = l.includes("coach") || l.includes("motorcoach");

  const mentionsAir = l.includes("air brake") || l.includes("air-brake");
  const mentionsHyd = l.includes("hydraulic") || l.includes("hyd brake") || l.includes("hyd-brake");

  const kind: "truck" | "trailer" | "bus" | "coach" =
    isCoach ? "coach" : isBus ? "bus" : isTrailer ? "trailer" : "truck";

  const sys: "air" | "hyd" | null = mentionsAir ? "air" : mentionsHyd ? "hyd" : null;
  if (!sys) return null;

  const key = `cvip_${kind}_${sys}` as const;
  return isCvipGroup(key) ? key : null;
}

/* ------------------------------------------------------------------ */
/* Narrow HD-only gating (AI augmentation ONLY)                        */
/* ------------------------------------------------------------------ */
/**
 * IMPORTANT:
 * We only strip items that are unambiguously HD/air/tractor-trailer specific.
 * We do NOT gate shared items (lights, tires, wheel bearings, leaks, etc.).
 */

const HD_ONLY_ITEM_PATTERNS: RegExp[] = [
  /push\s*rod/i,
  /slack\s*adjuster/i,
  /\bs-?cam\b/i,
  /treadle\s*valve/i,
  /glad\s*hand/i,
  /tractor\s*protection/i,
  /trailer\s*hand\s*valve/i,
  /spring\s*brake/i,
  /\bair\s*compress(or|ion)\b/i,
  /air\s*dryer/i,
  /governor\s*(cut-?in|cut-?out)/i,
  /\bair\s*tank\b/i,
  /air\s*leak(age)?/i,
  /fifth\s*wheel/i,
  /\bking\s*pin\b/i,
  /landing\s*gear/i,
  /service\s*brake\b/i, // AI tends to phrase air-brake content this way
];

const HD_ONLY_SECTION_PATTERNS: RegExp[] = [
  /\bbrakes?\b.*\bair\b/i,
  /\bair\s*system\b/i,
  /\bfifth\s*wheel\b/i,
  /\bcouplers?\b/i,
  /\bglad\s*hand\b/i,
];

function isHdOnlySectionTitle(title: string): boolean {
  return HD_ONLY_SECTION_PATTERNS.some((re) => re.test(title));
}

function isHdOnlyItemLabel(label: string): boolean {
  return HD_ONLY_ITEM_PATTERNS.some((re) => re.test(label));
}

function aiContainsHdOnly(sections: SectionOut[]): boolean {
  for (const s of sections) {
    if (isHdOnlySectionTitle(s.title)) return true;
    for (const it of s.items) {
      if (isHdOnlyItemLabel(it.item)) return true;
    }
  }
  return false;
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
                required: ["item", "unit"],
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
/* Response parsing (NO any)                                          */
/* ------------------------------------------------------------------ */

type RespContentNode = {
  type?: unknown;
  output_json?: unknown;
  text?: unknown;
};

function extractOutputJson(resp: unknown): unknown | null {
  if (!isRecord(resp)) return null;

  // Shape 1: resp.output is an array of message-like nodes
  const out = resp.output;
  if (Array.isArray(out) && out.length > 0) {
    const first = out[0];
    if (isRecord(first)) {
      const outType = asString(first.type);
      const content = first.content;

      if (outType === "message" && Array.isArray(content)) {
        const nodes: RespContentNode[] = content
          .filter((n): n is Record<string, unknown> => isRecord(n))
          .map((n) => ({
            type: n.type,
            output_json: (n as Record<string, unknown>).output_json,
            text: (n as Record<string, unknown>).text,
          }));

        const jsonNode = nodes.find((n) => asString(n.type) === "output_json");
        if (jsonNode) return jsonNode.output_json ?? null;

        const textNode = nodes.find((n) => asString(n.type) === "text");
        if (textNode) {
          const txt = asString(textNode.text);
          if (!txt) return null;
          try {
            return JSON.parse(txt);
          } catch {
            return null;
          }
        }
      }
    }
  }

  // Shape 2: some SDKs expose resp.output_text
  const outputText = asString((resp as Record<string, unknown>).output_text);
  if (outputText) {
    try {
      return JSON.parse(outputText);
    } catch {
      return null;
    }
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* Route                                                              */
/* ------------------------------------------------------------------ */

export async function POST(req: Request) {
  try {
    const body: unknown = await req.json();
    if (!isRecord(body)) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const prompt = asString(body.prompt)?.trim() ?? null;
    if (!prompt) {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }

    const promptIsAuto = promptSaysAutomotive(prompt);

    // Optional explicit inputs
    const vehicleTypeIn = body.vehicleType;
    const brakeSystemIn = body.brakeSystem;
    const dutyClassIn = body.dutyClass;
    const cvipGroupIn = body.cvipGroup;
    const targetCountIn = body.targetCount;

    // 1) vehicleType (prompt wins if it says automotive)
    let vehicleType: VehicleType;
    if (promptIsAuto) {
      vehicleType = "car";
    } else if (isVehicleType(vehicleTypeIn)) {
      vehicleType = vehicleTypeIn;
    } else {
      const p = prompt.toLowerCase();
      vehicleType =
        p.includes("truck") ||
        p.includes("bus") ||
        p.includes("trailer") ||
        p.includes("hd") ||
        p.includes("heavy duty")
          ? "truck"
          : "car";
    }

    // 2) dutyClass (body > prompt > vehicle fallback)
    let dutyClass: DutyClass;
    if (isDutyClass(dutyClassIn)) {
      dutyClass = dutyClassIn;
    } else {
      const fromPrompt = inferDutyFromPrompt(prompt);
      dutyClass = fromPrompt ?? (vehicleType === "car" ? "light" : "heavy");
    }

    // 3) brakeSystem (prompt auto => hyd, else body, else inferred)
    let brakeSystem: BrakeSystem;
    if (promptIsAuto) {
      brakeSystem = "hyd_brake";
    } else if (isBrakeSystem(brakeSystemIn)) {
      brakeSystem = brakeSystemIn;
    } else {
      brakeSystem =
        dutyClass === "light"
          ? "hyd_brake"
          : vehicleType === "car"
            ? "hyd_brake"
            : "air_brake";
    }

    // 4) cvipGroup (body > prompt inference, but never forced)
    let cvipGroup: CvipGroup | undefined;
    if (isCvipGroup(cvipGroupIn)) {
      cvipGroup = cvipGroupIn;
    } else {
      const inferred = inferCvipGroupFromPrompt(prompt);
      if (inferred) cvipGroup = inferred;
    }

    // 5) targetCount
    let targetCount: number;
    const n = asNumber(targetCountIn);
    if (n && n > 0) {
      targetCount = Math.floor(n);
    } else {
      const m = prompt.match(/(\d{2,3})\s*(point|pt)?/i);
      targetCount = m ? parseInt(m[1] ?? "20", 10) : 20;
    }

    // 6) deterministic base (DO NOT text-gate base)
    const baseSections = buildFromMaster({
      vehicleType,
      brakeSystem,
      targetCount,
      dutyClass,
      cvipGroup,
    });

    // If no OpenAI, return base
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ sections: baseSections }, { status: 200 });
    }

    // 7) try to augment with OpenAI
    let aiSections: SectionOut[] = [];
    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const lightDutyMode = dutyClass === "light" || brakeSystem === "hyd_brake";

      const system = [
        "You are an AI assistant for generating vehicle inspection templates.",
        lightDutyMode
          ? "This is a LIGHT-DUTY / HYDRAULIC inspection. Avoid HD AIR-BRAKE and tractor-trailer-specific items (push rod travel, slack adjusters, air tanks/compressor/governor, glad hands, fifth wheel, kingpin, landing gear). Shared items like tires, lights, wheel bearings, steering linkage, leaks, and general safety checks are allowed."
          : dutyClass === "medium"
            ? "This is a MEDIUM-DUTY inspection. Prefer hydraulic/light-truck items. Avoid tractor-only items like fifth wheel unless explicitly requested."
            : "This inspection may include HEAVY-DUTY / AIR-BRAKE content where appropriate.",
        "Return ONLY JSON that follows the supplied schema.",
        `Aim for about ${targetCount} inspection items.`,
      ].join(" ");

      const user = [
        `Prompt: ${prompt}`,
        `Vehicle type: ${vehicleType}`,
        `Duty class: ${dutyClass}`,
        `Brake system: ${brakeSystem}`,
        cvipGroup ? `CVIP group: ${cvipGroup}` : null,
        "Generate inspection sections and items suitable for a professional repair shop.",
      ]
        .filter((v): v is string => Boolean(v))
        .join("\n");

      const resp = await openai.responses.create({
        model: "gpt-4o-mini",
        input: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        text: {
          format: {
            type: "json_schema",
            name: SectionsSchema.name,
            schema: SectionsSchema.schema,
          },
        },
        max_output_tokens: 4000,
      });

      const aiRaw = extractOutputJson(resp) ?? {};
      aiSections = sanitizeSections(aiRaw);
    } catch (err) {
      console.error("OpenAI augmentation failed, returning base only:", err);
      return NextResponse.json({ sections: baseSections }, { status: 200 });
    }

    // 8) AI-only gating: for light-duty/hyd, strip ONLY unambiguous HD-only content
    const lightDutyMode = dutyClass === "light" || brakeSystem === "hyd_brake";
    if (lightDutyMode) {
      aiSections = aiSections
        .map((sec) => {
          if (isHdOnlySectionTitle(sec.title)) return null;
          const filteredItems = sec.items.filter((it) => !isHdOnlyItemLabel(it.item));
          if (!filteredItems.length) return null;
          return { ...sec, items: filteredItems };
        })
        .filter((v): v is SectionOut => v !== null);
    }

    // 9) Merge policy:
    // - Require enough AI items
    // - In light-duty mode, refuse to merge if AI still contains HD-only signatures
    const aiItemCount = aiSections.reduce((sum, s) => sum + s.items.length, 0);
    const minItemsToMerge = Math.max(10, Math.floor(targetCount * 0.5));

    const shouldMerge =
      aiSections.length >= 3 &&
      aiItemCount >= minItemsToMerge &&
      (!lightDutyMode || !aiContainsHdOnly(aiSections));

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
            if (!seen.has(key)) existing.items.push(it);
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
          { title: "General", items: [{ item: "Visual walkaround", unit: null }] },
        ],
      },
      { status: 200 },
    );
  }
}