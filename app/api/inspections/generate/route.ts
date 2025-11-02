// app/api/inspections/generate/route.ts
import "server-only";
import { NextResponse } from "next/server";

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

export const runtime = "edge"; // optional

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

/* ---------------------- Defensive sanitizer ---------------------- */
function sanitizeSections(input: unknown): InspectionSection[] {
  const sectionsIn: unknown[] =
    isRecord(input) && Array.isArray((input as Record<string, unknown>).sections)
      ? ((input as Record<string, unknown>).sections as unknown[])
      : [];

  const clean: InspectionSection[] = [];

  for (const sec of sectionsIn) {
    if (!isRecord(sec)) continue;

    const title = (asString(sec.title) ?? "").trim();
    if (!title) continue;

    const itemsIn: unknown[] = Array.isArray(sec.items) ? (sec.items as unknown[]) : [];
    const itemsOut: InspectionItem[] = [];

    for (const raw of itemsIn) {
      if (!isRecord(raw)) continue;

      const label = (asString(raw.item) ?? asString(raw.name) ?? "").trim();
      if (!label) continue;

      const providedUnit = (asString(raw.unit) ?? "").trim();
      const unit = providedUnit || unitHint(label) || null;

      itemsOut.push({
        item: label,
        unit,
        value: isRecord(raw.value) ? null : (raw.value as string | number | null | undefined) ?? "",
        notes: asString(raw.notes) ?? null,
        status: (asString(raw.status) as Status) ?? undefined,
        photoUrls: Array.isArray(raw.photoUrls) ? (raw.photoUrls as string[]) : undefined,
        recommend: Array.isArray(raw.recommend) ? (raw.recommend as string[]) : undefined,
      });
    }

    if (itemsOut.length) clean.push({ title, items: itemsOut });
  }

  // Always return something
  if (!clean.length) {
    return [
      {
        title: "General",
        items: [
          { item: "Visual walkaround", unit: null, status: "na", value: "" },
          { item: "Record warning lights", unit: null, status: "na", value: "" },
        ],
      },
    ];
  }

  return clean;
}

/* -------------------- Corner-grid enforcement -------------------- */
type BrakeSystem = "air" | "hydraulic";

function inferBrakeSystem(vehicleType?: "car" | "truck" | "bus" | "trailer"): BrakeSystem {
  return vehicleType === "car" ? "hydraulic" : "air";
}

function hasCornerishContent(sections: InspectionSection[]): boolean {
  return sections.some(
    (s) =>
      /corner|axle|tire|wheel/i.test(s.title) ||
      s.items.some((i) => /tire|tread|pressure|pad|rotor|lining/i.test((i.item ?? "").toLowerCase()))
  );
}

function ensureCornerSection(
  sections: InspectionSection[],
  system: BrakeSystem
): InspectionSection[] {
  if (hasCornerishContent(sections)) return sections;

  if (system === "hydraulic") {
    sections.push({
      title: "Corner Grid — LF/RF/LR/RR",
      items: [
        // Pressure
        { item: "LF Tire Pressure", unit: "psi", value: "" },
        { item: "RF Tire Pressure", unit: "psi", value: "" },
        { item: "LR Tire Pressure", unit: "psi", value: "" },
        { item: "RR Tire Pressure", unit: "psi", value: "" },
        // Tread
        { item: "LF Tire Tread", unit: "mm", value: "" },
        { item: "RF Tire Tread", unit: "mm", value: "" },
        { item: "LR Tire Tread", unit: "mm", value: "" },
        { item: "RR Tire Tread", unit: "mm", value: "" },
        // Brakes (common light-duty)
        { item: "LF Brake Pad Thickness", unit: "mm", value: "" },
        { item: "RF Brake Pad Thickness", unit: "mm", value: "" },
        { item: "LR Brake Pad Thickness", unit: "mm", value: "" },
        { item: "RR Brake Pad Thickness", unit: "mm", value: "" },
        { item: "LF Rotor Thickness", unit: "mm", value: "" },
        { item: "RF Rotor Thickness", unit: "mm", value: "" },
      ],
    });
  } else {
    sections.push({
      title: "Axles — Air Corner Grid",
      items: [
        // Steer (single)
        { item: "Steer 1 Left Tire Pressure", unit: "psi", value: "" },
        { item: "Steer 1 Right Tire Pressure", unit: "psi", value: "" },
        { item: "Steer 1 Left Tread Depth", unit: "mm", value: "" },
        { item: "Steer 1 Right Tread Depth", unit: "mm", value: "" },

        // Drive 1 (dual) — inner/outer required
        { item: "Drive 1 Left Tire Pressure Inner", unit: "psi", value: "" },
        { item: "Drive 1 Left Tire Pressure Outer", unit: "psi", value: "" },
        { item: "Drive 1 Right Tire Pressure Inner", unit: "psi", value: "" },
        { item: "Drive 1 Right Tire Pressure Outer", unit: "psi", value: "" },
        { item: "Drive 1 Left Tread Depth Inner", unit: "mm", value: "" },
        { item: "Drive 1 Left Tread Depth Outer", unit: "mm", value: "" },
        { item: "Drive 1 Right Tread Depth Inner", unit: "mm", value: "" },
        { item: "Drive 1 Right Tread Depth Outer", unit: "mm", value: "" },

        // Tag (single) — no duals
        { item: "Tag Left Tire Pressure", unit: "psi", value: "" },
        { item: "Tag Right Tire Pressure", unit: "psi", value: "" },
        { item: "Tag Left Tread Depth", unit: "mm", value: "" },
        { item: "Tag Right Tread Depth", unit: "mm", value: "" },
      ],
    });
  }
  return sections;
}

/* ------------------------------- Route ------------------------------- */
export async function POST(req: Request) {
  try {
    const { prompt, vehicleType } = (await req.json()) as {
      prompt: string;
      vehicleType?: "car" | "truck" | "bus" | "trailer";
    };

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }

    // ---- Replace this block with real LLM output later; we still sanitize below.
    const aiMock: unknown = {
      sections: [
        {
          title: "Lights & Safety (AI)",
          items: [
            { item: "Headlights", status: "ok", unit: null, value: "", notes: "" },
            { item: "Turn Signals", status: "ok", unit: null, value: "", notes: "" },
            { item: "Brake Lights", status: "ok", unit: null, value: "", notes: "" },
          ],
        },
        {
          title: vehicleType ? `Tires & Brakes — ${vehicleType}` : "Tires & Brakes",
          items: [
            { item: "LF Tire Tread", unit: "mm", value: "", notes: "" },
            { item: "RF Tire Tread", unit: "mm", value: "", notes: "" },
            { item: "Brake Pad Thickness (Front)", unit: "mm", value: "", notes: "" },
          ],
        },
      ],
    };
    // ------------------------------------------------------------------

    // Sanitize, then ensure the correct corner grid always exists.
    const system = inferBrakeSystem(vehicleType);
    let sections = sanitizeSections(aiMock);
    sections = ensureCornerSection(sections, system);

    return NextResponse.json({ sections });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}
