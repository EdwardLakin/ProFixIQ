import { NextResponse } from "next/server";
import masterServicesList from "@/features/inspections/lib/inspection/masterServicesList";

type JobType = "maintenance" | "repair" | "diagnosis" | "inspection";

interface VehicleContext {
  year?: string | number | null;
  make?: string | null;
  model?: string | null;
  mileage?: string | number | null;
}

// ---------------- mileage rules ----------------
function getMileageRecommendations(mileage: number | null | undefined): string[] {
  if (mileage == null || Number.isNaN(mileage)) return [];
  const mi = mileage;

  const rec: string[] = [];
  if (mi >= 5_000) rec.push("oil"); // “Engine oil and filter change”
  if (mi >= 20_000) rec.push("tire rotation", "brake inspection");
  if (mi >= 50_000) rec.push("transmission", "differential", "transfer case");
  if (mi >= 100_000) rec.push("coolant", "fuel filter");
  if (mi >= 150_000) rec.push("timing", "major inspection");
  return rec;
}

// ---------------- vehicle heuristics ----------------
function detectKind(v: VehicleContext | null): {
  isDiesel: boolean;
  isHeavyDuty: boolean;
  isCommercial: boolean;
  hint: string;
  mileageNumber: number | null;
} {
  const make = (v?.make ?? "").toLowerCase();
  const model = (v?.model ?? "").toLowerCase();
  const yearStr = v?.year != null ? String(v.year) : "";
  const hintParts = [yearStr, v?.make, v?.model].filter(Boolean);
  const hint = hintParts.length ? ` (${hintParts.join(" ")})` : "";

  // Simple diesel detection
  const dieselMarkers = ["diesel", "tdi", "power stroke", "duramax", "cummins"];
  const isDiesel =
    dieselMarkers.some((m) => model.includes(m) || make.includes(m)) ||
    /2500|3500|4500|5500/.test(model);

  // Heavy duty pickup / chassis
  const isHeavyDuty =
    /f[- ]?250|f[- ]?350|2500|3500|4500|5500|ram\s?(25|35|45|55)00|silverado\s?(25|35)00|sierra\s?(25|35)00/i.test(
      `${make} ${model}`,
    );

  // Commercial vans / fleet
  const isCommercial =
    /(sprinter|transit|promaster|express|savanna|nv200|e-?series)/i.test(model) ||
    /cvip|fleet|cube|cargo/i.test(model);

  const mileageNumber = v?.mileage != null ? Number(v.mileage) : null;

  return { isDiesel, isHeavyDuty, isCommercial, hint, mileageNumber };
}

// helper: fuzzy match into master list
function pickByKeywords(keywords: string[]): string[] {
  const picks: string[] = [];
  for (const cat of masterServicesList) {
    for (const it of cat.items) {
      const li = it.item.toLowerCase();
      if (keywords.some((k) => li.includes(k.toLowerCase()))) {
        picks.push(it.item);
      }
    }
  }
  // de-dupe while preserving order
  return Array.from(new Set(picks));
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      prompt?: string | null;
      vehicle?: VehicleContext | null;
    };

    const v = body.vehicle ?? null;
    const { isDiesel, isHeavyDuty, isCommercial, hint, mileageNumber } = detectKind(v);
    const userPrompt = String(body.prompt ?? "").trim().toLowerCase();

    // ---------- A/B: build suggestions ----------
    // 1) Prompt → repair/diagnosis phrasing (very basic contains for now)
    const promptMatches =
      userPrompt.length === 0
        ? []
        : masterServicesList.flatMap((category) =>
            category.items
              .filter((i) => i.item.toLowerCase().includes(userPrompt))
              .map((i) => ({
                name: `${i.item}${hint}`,
                jobType: "repair" as const,
                laborHours: 1.0,
                notes: `Based on issue: ${body.prompt}`,
              })),
          );

    // 2) Mileage rules → maintenance
    const mileageKeys = getMileageRecommendations(mileageNumber);
    const mileageItems = pickByKeywords(mileageKeys);
    const mileageMatches = mileageItems.map((name) => ({
      name: `${name}${hint}`,
      jobType: "maintenance" as JobType,
      laborHours: 1.0,
      notes: v?.mileage != null ? `Recommended at ~${v.mileage} km/mi` : "Mileage-based recommendation",
    }));

    // 3) Diesel / Heavy-duty / Commercial heuristics
    const dieselKeys = isDiesel ? ["DEF", "DPF", "EGR", "diesel fuel filter", "water separator"] : [];
    const hdKeys = isHeavyDuty ? ["Grease chassis (heavy-duty)", "Push rod travel", "5th wheel", "brake shoes"] : [];
    const commKeys = isCommercial ? ["CVIP", "Annual safety inspection"] : [];
    const kindItems = pickByKeywords([...dieselKeys, ...hdKeys, ...commKeys]);
    const kindMatches = kindItems.map((name) => ({
      name: `${name}${hint}`,
      jobType: name.toLowerCase().includes("inspection") ? ("inspection" as JobType) : ("maintenance" as JobType),
      laborHours: 1.0,
      notes: isDiesel
        ? "Diesel/HD recommendation"
        : isHeavyDuty
        ? "Heavy-duty maintenance"
        : "Commercial/fleet maintenance",
    }));

    // ---------- D: fallback ----------
    const fallback =
      promptMatches.length || mileageMatches.length || kindMatches.length
        ? []
        : ([
            {
              name: `General inspection${hint}`,
              jobType: "inspection" as JobType,
              laborHours: 1.0,
              notes: "Multi-point inspection",
            },
            {
              name: `Oil & filter service${hint}`,
              jobType: "maintenance" as JobType,
              laborHours: 0.8,
              notes: "Basic preventative maintenance",
            },
          ] satisfies { name: string; jobType: JobType; laborHours: number; notes: string }[]);

    const items = [...promptMatches, ...mileageMatches, ...kindMatches, ...fallback].slice(0, 8);

    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI Suggest failed" },
      { status: 400 },
    );
  }
}