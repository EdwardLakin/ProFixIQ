// app/api/inspections/build/route.ts
import "server-only";
import { NextResponse } from "next/server";

// --------- Types ---------
type SectionItem = { item: string; unit?: string | null };
type SectionOut = { title: string; items: SectionItem[] };

// --------- Helpers ---------
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

    const rawItems: unknown[] = Array.isArray(sec.items) ? (sec.items as unknown[]) : [];
    const items: SectionItem[] = [];

    for (const ri of rawItems) {
      if (!isRecord(ri)) continue;
      const label =
        asString(ri.item)?.trim() ??
        asString(ri.name)?.trim() ??
        "";
      if (!label) continue;

      const providedUnit = asString(ri.unit)?.trim();
      const unit = providedUnit && providedUnit.length > 0 ? providedUnit : unitHint(label);

      items.push({ item: label, unit: unit ?? null });
    }

    if (items.length) {
      clean.push({ title, items });
    }
  }

  // fallback
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

export const runtime = "edge";

export async function POST(req: Request) {
  try {
    const body: unknown = await req.json();
    if (!isRecord(body)) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const prompt = asString(body.prompt);
    const vehicleType = asString(body.vehicleType);

    if (!prompt) {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }

    // this is still the simple mocked shape — your UI just needs a predictable shape here
    const mock: unknown = {
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

    const sections = sanitizeSections(mock);
    return NextResponse.json({ sections });
  } catch (err) {
    console.error("build route failed:", err);
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}