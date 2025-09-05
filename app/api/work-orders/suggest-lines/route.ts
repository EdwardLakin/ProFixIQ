// app/api/work-orders/suggest-lines/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@shared/types/types/supabase";
import { openai } from "lib/server/openai";

export const runtime = "nodejs";

type DB = Database;

type VehicleLite = {
  id: string | null;
  year: string | null;
  make: string | null;
  model: string | null;
};

type ReqBody =
  | { jobId: string; vehicleId?: VehicleLite | string | null }
  | { workOrderId: string; vehicleId?: VehicleLite | string | null };

type Suggestion = {
  name: string;
  laborHours: number;
  jobType: "diagnosis" | "repair" | "maintenance" | "tech-suggested";
  notes: string;
  aiComplaint?: string;
  aiCause?: string;
  aiCorrection?: string;
};

function isVehicleLite(v: unknown): v is VehicleLite {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    "id" in o &&
    "year" in o &&
    "make" in o &&
    "model" in o &&
    (o.id === null || typeof o.id === "string") &&
    (o.year === null || typeof o.year === "string") &&
    (o.make === null || typeof o.make === "string") &&
    (o.model === null || typeof o.model === "string")
  );
}

function coerceSuggestion(u: unknown): Suggestion | null {
  if (typeof u !== "object" || u === null) return null;
  const o = u as Record<string, unknown>;

  const name = typeof o.name === "string" ? o.name : null;
  const laborHours =
    typeof o.laborHours === "number" && Number.isFinite(o.laborHours)
      ? o.laborHours
      : null;
  const jobType =
    o.jobType === "diagnosis" ||
    o.jobType === "repair" ||
    o.jobType === "maintenance" ||
    o.jobType === "tech-suggested"
      ? o.jobType
      : null;
  const notes = typeof o.notes === "string" ? o.notes : "";

  if (!name || laborHours === null || !jobType) return null;

  const aiComplaint =
    typeof o.aiComplaint === "string" ? o.aiComplaint : undefined;
  const aiCause = typeof o.aiCause === "string" ? o.aiCause : undefined;
  const aiCorrection =
    typeof o.aiCorrection === "string" ? o.aiCorrection : undefined;

  return { name, laborHours, jobType, notes, aiComplaint, aiCause, aiCorrection };
}

export async function POST(req: Request) {
  const supabase = createServerComponentClient<DB>({ cookies });

  try {
    const body = (await req.json()) as ReqBody;

    // Gather context
    let complaint: string | null = null;
    let vehicle: VehicleLite | null = null;

    if ("jobId" in body) {
      const { data: line } = await supabase
        .from("work_order_lines")
        .select("complaint, vehicle_id, vehicles:vehicle_id ( year, make, model )")
        .eq("id", body.jobId)
        .single();

      if (line?.complaint) complaint = line.complaint;

      // Prefer explicit vehicleId passed in the request, else derive from the joined record
      if (isVehicleLite(body.vehicleId)) {
        vehicle = body.vehicleId;
      } else if (line?.vehicles) {
        const v = line.vehicles as unknown as { year: number | null; make: string | null; model: string | null };
        vehicle = {
          id: (line as unknown as { vehicle_id: string | null }).vehicle_id ?? null,
          year: v?.year != null ? String(v.year) : null,
          make: v?.make ?? null,
          model: v?.model ?? null,
        };
      }
    } else if ("workOrderId" in body) {
      // Pull minimal context from the work order (first line complaint if present)
      const { data: lines } = await supabase
        .from("work_order_lines")
        .select("complaint, vehicle_id")
        .eq("work_order_id", body.workOrderId)
        .order("created_at", { ascending: true })
        .limit(1);

      if (lines && lines.length > 0) {
        complaint = lines[0]?.complaint ?? null;
      }

      if (isVehicleLite(body.vehicleId)) {
        vehicle = body.vehicleId;
      }
    }

    // Compose prompt
    const vStr =
      vehicle && (vehicle.make || vehicle.model || vehicle.year)
        ? `${vehicle.year ?? ""} ${vehicle.make ?? ""} ${vehicle.model ?? ""}`.trim()
        : "Unknown vehicle";

    const userContext =
      [
        complaint ? `Complaint: ${complaint}` : null,
        vehicle ? `Vehicle: ${vStr}` : null,
      ]
        .filter(Boolean)
        .join("\n") || "No complaint provided. Vehicle unknown.";

    const system = [
      "You are a service advisor assistant for an auto shop.",
      "Return a JSON array of 3-6 suggested jobs related to the complaint and vehicle.",
      "Each item must have fields: name (string), laborHours (number), jobType ('diagnosis'|'repair'|'maintenance'|'tech-suggested'), notes (string).",
      "When helpful, include aiComplaint, aiCause, aiCorrection to pre-fill story text.",
      "Keep laborHours realistic; do not exceed 8 hours for a single item.",
      "Only output raw JSON (no markdown).",
    ].join(" ");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContext },
      ],
      max_tokens: 500,
    });

    const raw = completion.choices[0]?.message?.content ?? "[]";

    // Parse & validate
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = [];
    }

    const suggestions: Suggestion[] = Array.isArray(parsed)
      ? (parsed
          .map(coerceSuggestion)
          .filter((s): s is Suggestion => s !== null)
          .slice(0, 6))
      : [];

    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json(
      { error: "Failed to generate suggestions" },
      { status: 500 }
    );
  }
}