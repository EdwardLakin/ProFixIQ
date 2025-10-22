// app/api/ai/menu/suggest/route.ts
import { NextResponse } from "next/server";

// Replace this with your actual LLM call. This stub simply returns
// a few hard-coded suggestions so your UI works immediately.
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      prompt: string;
      vehicle?: { year?: number | string | null; make?: string | null; model?: string | null } | null;
    };

    const hint =
      body.vehicle && (body.vehicle.make || body.vehicle.model)
        ? ` for ${[body.vehicle.year, body.vehicle.make, body.vehicle.model]
            .filter(Boolean)
            .join(" ")}`
        : "";

    // TODO: replace this block with a real model call (OpenAI, etc.)
    // Expect return shape: { items: Array<{ name, jobType, laborHours, notes? }> }
    const items = [
      {
        name: `Brake inspection${hint}`,
        jobType: "inspection",
        laborHours: 0.5,
        notes: "Road test and check pad/rotor wear, caliper slides, brake fluid level.",
      },
      {
        name: `Wheel balance${hint}`,
        jobType: "maintenance",
        laborHours: 1.0,
        notes: "Balance all four wheels; re-torque lug nuts.",
      },
      {
        name: `Front brake service${hint}`,
        jobType: "repair",
        laborHours: 1.6,
        notes: "Pads/rotors if below spec; clean & lube hardware.",
      },
    ] as const;

    return NextResponse.json({ items });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Bad request";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}