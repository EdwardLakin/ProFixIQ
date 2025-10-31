import "server-only";
import { NextResponse } from "next/server";

type InspectionItemStatus = "ok" | "fail" | "na" | "recommend";
type InspectionSection = { title: string; items: { item: string; status?: InspectionItemStatus }[] };

export const dynamic = "force-dynamic";

function cheapBuildFromPrompt(prompt: string): InspectionSection[] {
  const p = prompt.toLowerCase();
  const sections: InspectionSection[] = [];
  const add = (title: string, items: string[]) =>
    sections.push({ title, items: items.map((item) => ({ item, status: "na" as InspectionItemStatus })) });

  if (/brake/.test(p)) {
    add("Brakes", ["Front brake pads", "Rear brake pads", "Rotors / drums", "Brake fluid level", "Brake lines and hoses", "ABS wiring / sensors"]);
  }
  if (/tire|tread/.test(p)) {
    add("Tires", [
      "LF Tread Depth", "RF Tread Depth", "LR Tread Depth (Outer)", "LR Tread Depth (Inner)",
      "RR Tread Depth (Outer)", "RR Tread Depth (Inner)", "LF Tire Pressure", "RF Tire Pressure",
      "LR Tire Pressure", "RR Tire Pressure",
    ]);
  }
  if (/suspension|shock|strut|bushing|control arm/.test(p)) {
    add("Suspension", ["Front springs (coil/leaf)", "Rear springs (coil/leaf)", "Shocks / struts", "Control arms / ball joints", "Sway bar bushings / links"]);
  }
  if (/light|signal|lamp|headlight|tail/.test(p)) {
    add("Lighting & Reflectors", [
      "Headlights (high/low beam)", "Turn signals / flashers", "Brake lights", "Tail lights",
      "Reverse lights", "License plate light", "Clearance / marker lights", "Reflective tape / reflectors",
      "Hazard switch function",
    ]);
  }
  if (/fluid|oil|coolant|ps fluid|power steering|washer/.test(p)) {
    add("Fluids", [
      "Engine oil level / condition", "Coolant level / condition", "Brake fluid level",
      "Power steering fluid level", "Washer fluid level", "Transmission fluid level / leaks",
    ]);
  }
  if (sections.length === 0) add("General", ["Visual walkaround", "Record warning lights", "Note customer concerns", "Road-test notes"]);
  return sections;
}

export async function POST(req: Request) {
  try {
    const { prompt } = (await req.json()) as { prompt: string };
    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json({ error: "Missing prompt" }, { status: 400 });
    }
    const sections = cheapBuildFromPrompt(prompt);
    return NextResponse.json({ sections });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Build failed" }, { status: 500 });
  }
}