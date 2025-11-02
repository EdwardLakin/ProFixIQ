import "server-only";
import { NextResponse } from "next/server";

// --------- Types ---------
type SectionItem = { item: string; unit?: string | null };
type SectionOut = { title: string; items: SectionItem[] };

// --------- Type guards ---------
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

// (Optional) simple unit heuristics if model omits them
function unitHint(label: string): string | null {
  const l = label.toLowerCase();
  if (/(tread|pad|lining|rotor|drum|push ?rod)/.test(l)) return "mm";
  if (/(pressure|psi|kpa|leak rate|warning)/.test(l)) return l.includes("kpa") ? "kPa" : "psi";
  if (/(torque|ft·lb|ft-lb|nm|n·m)/.test(l)) return l.includes("n") ? "N·m" : "ft·lb";
  return null;
}

// Defensive sanitizer in case the model returns prose or extra keys
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

    if (itemsOut.length) {
      clean.push({ title, items: itemsOut });
    }
  }

  // Ensure we always return something
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

export const runtime = "edge" as const; // optional

export async function POST(req: Request) {
  try {
    const body: unknown = await req.json();
    if (!isRecord(body)) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const prompt = asString(body.prompt);
    const vehicleType = asString(body.vehicleType); // "car" | "truck" | "bus" | "trailer" (not enforced here)

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }

    // TODO: call your real LLM here and assign its output to `ai`.
    // For now, mock output (still sanitized below).
    const ai: unknown = {
      sections: [
        {
          title: "Exterior & Lighting",
          items: [
            { item: "Headlights" },
            { item: "Turn Signals" },
            { item: "Brake Lights" },
          ],
        },
        {
          title: `Tires & Suspension — ${vehicleType ?? "vehicle"}`,
          items: [
            { item: "LF Tire Tread", unit: "mm" },
            { item: "RF Tire Tread", unit: "mm" },
            { item: "Tire Pressure (Front)", unit: "psi" },
          ],
        },
      ],
    };

    const sections = sanitizeSections(ai);
    return NextResponse.json({ sections }, { status: 200 });
  } catch (e) {
    // e is unknown; just log as-is
    // eslint-disable-next-line no-console
    console.error(e);
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}
