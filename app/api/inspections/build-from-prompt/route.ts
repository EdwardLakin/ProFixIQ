import "server-only";
import { NextResponse } from "next/server";

// Minimal schema your UI expects
type SectionOut = { title: string; items: { item: string; unit?: string | null }[] };

// (Optional) simple unit heuristics if model omits them
function unitHint(label: string): string | null {
  const l = label.toLowerCase();
  if (/(tread|pad|lining|rotor|drum|push ?rod)/.test(l)) return "mm";
  if (/(pressure|psi|kpa|leak rate|warning)/.test(l)) return l.includes("kpa") ? "kPa" : "psi";
  if (/(torque|ft·lb|ft-lb|nm|n·m)/.test(l)) return l.includes("n") ? "N·m" : "ft·lb";
  return null;
}

// Defensive sanitizer in case the model returns prose or extra keys
function sanitizeSections(input: any): SectionOut[] {
  const sections = Array.isArray(input?.sections) ? input.sections : [];
  const clean: SectionOut[] = [];

  for (const sec of sections) {
    const title = typeof sec?.title === "string" ? sec.title.trim() : "";
    if (!title) continue;

    const itemsIn = Array.isArray(sec?.items) ? sec.items : [];
    const itemsOut: { item: string; unit?: string | null }[] = [];

    for (const raw of itemsIn) {
      const label =
        typeof raw?.item === "string" ? raw.item.trim()
        : typeof raw?.name === "string" ? raw.name.trim()
        : "";
      if (!label) continue;

      let unit: string | null = null;
      if (typeof raw?.unit === "string" && raw.unit.trim()) {
        unit = raw.unit.trim();
      } else {
        unit = unitHint(label);
      }
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

export const runtime = "edge"; // optional

export async function POST(req: Request) {
  try {
    const { prompt, vehicleType } = (await req.json()) as {
      prompt: string;
      vehicleType?: "car" | "truck" | "bus" | "trailer";
    };

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }

    // TODO: call your real LLM here.
    // const ai = await callLLM({ prompt, vehicleType, systemPrompt: <the JSON-only instructions> })
    // For now, we expect JSON in `ai`, but we sanitize regardless.

    // ----- MOCK for now; replace with model output -----
    const ai = {
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
    // -----------------------------------------------

    const sections = sanitizeSections(ai);
    return NextResponse.json({ sections }, { status: 200 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}
