import "server-only";
import { NextResponse } from "next/server";

/** Minimal shape your UI already understands */
type InspectionItem = {
  item?: string;
  name?: string;
  unit?: string | null;
  value?: string | number | null;
  notes?: string | null;
  status?: "ok" | "fail" | "na" | "recommend";
  photoUrls?: string[];
  recommend?: string[];
};

type InspectionSection = {
  title: string;
  items: InspectionItem[];
};

export async function POST(req: Request) {
  try {
    const { prompt, vehicleType } = (await req.json()) as {
      prompt: string;
      vehicleType?: "car" | "truck" | "bus" | "trailer";
    };

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }

    // ── Replace this stub with your model call (OpenAI, etc.)
    // Parse prompt → generate section list the app already renders.
    // Keep it deterministic for now:
    const sections: InspectionSection[] = [
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
    ];

    return NextResponse.json({ sections });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}