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

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    }

    // We’ll set shop context if we can determine a shop id from the WO (best effort).
    // This reduces “RLS hidden” reads for work_order_lines in shops that rely on current_shop_id().
    let shopIdForContext: string | null = null;

    // Gather context
    let complaint: string | null = null;
    let vehicle: VehicleLite | null = null;

    if ("jobId" in body) {
      // Get WO shop_id for context
      const { data: woJoin, error: woJoinErr } = await supabase
        .from("work_order_lines")
        .select("work_order_id, work_orders:work_order_id ( shop_id )")
        .eq("id", body.jobId)
        .maybeSingle();

      if (woJoinErr) {
        return NextResponse.json({ error: woJoinErr.message }, { status: 500 });
      }

      shopIdForContext =
        (woJoin?.work_orders as unknown as { shop_id?: string | null })?.shop_id ??
        null;

      if (shopIdForContext) {
        // If profile.shop_id is NULL, try to self-heal (same logic as add-suggested-lines)
        const { data: prof } = await supabase
          .from("profiles")
          .select("shop_id")
          .or(`id.eq.${user.id},user_id.eq.${user.id}`)
          .maybeSingle();

        if (!prof?.shop_id) {
          await supabase
            .from("profiles")
            .update({ shop_id: shopIdForContext })
            .or(`id.eq.${user.id},user_id.eq.${user.id}`);
        }

        // Set session context (may still fail if user truly isn’t in that shop)
        await supabase.rpc("set_current_shop_id", { p_shop_id: shopIdForContext });
      }

      const { data: line, error: lineErr } = await supabase
        .from("work_order_lines")
        .select("complaint, vehicle_id, vehicles:vehicle_id ( year, make, model )")
        .eq("id", body.jobId)
        .maybeSingle();

      if (lineErr) {
        return NextResponse.json({ error: lineErr.message }, { status: 500 });
      }

      if (line?.complaint) complaint = line.complaint;

      // Prefer explicit vehicleId passed in the request, else derive from joined record
      if (isVehicleLite(body.vehicleId)) {
        vehicle = body.vehicleId;
      } else if (line?.vehicles) {
        const v = line.vehicles as unknown as {
          year: number | null;
          make: string | null;
          model: string | null;
        };
        vehicle = {
          id: (line as unknown as { vehicle_id: string | null }).vehicle_id ?? null,
          year: v?.year != null ? String(v.year) : null,
          make: v?.make ?? null,
          model: v?.model ?? null,
        };
      }
    } else if ("workOrderId" in body) {
      // Fetch WO shop_id for context first
      const { data: wo, error: woErr } = await supabase
        .from("work_orders")
        .select("id, shop_id")
        .eq("id", body.workOrderId)
        .maybeSingle();

      if (woErr) {
        return NextResponse.json({ error: woErr.message }, { status: 500 });
      }
      if (!wo?.id) {
        return NextResponse.json({ error: "Work order not found" }, { status: 404 });
      }

      shopIdForContext = (wo.shop_id as string | null) ?? null;

      if (shopIdForContext) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("shop_id")
          .or(`id.eq.${user.id},user_id.eq.${user.id}`)
          .maybeSingle();

        if (!prof?.shop_id) {
          await supabase
            .from("profiles")
            .update({ shop_id: shopIdForContext })
            .or(`id.eq.${user.id},user_id.eq.${user.id}`);
        }

        await supabase.rpc("set_current_shop_id", { p_shop_id: shopIdForContext });
      }

      // Pull minimal context from first line
      const { data: lines, error: linesErr } = await supabase
        .from("work_order_lines")
        .select("complaint, vehicle_id")
        .eq("work_order_id", body.workOrderId)
        .order("created_at", { ascending: true })
        .limit(1);

      if (linesErr) {
        return NextResponse.json({ error: linesErr.message }, { status: 500 });
      }

      if (lines && lines.length > 0) {
        complaint = lines[0]?.complaint ?? null;
      }

      if (isVehicleLite(body.vehicleId)) {
        vehicle = body.vehicleId;
      }
    }

    const vStr =
      vehicle && (vehicle.make || vehicle.model || vehicle.year)
        ? `${vehicle.year ?? ""} ${vehicle.make ?? ""} ${vehicle.model ?? ""}`.trim()
        : "Unknown vehicle";

    const userContext =
      [complaint ? `Complaint: ${complaint}` : null, `Vehicle: ${vStr}`]
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

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = [];
    }

    const suggestions: Suggestion[] = Array.isArray(parsed)
      ? parsed
          .map(coerceSuggestion)
          .filter((s): s is Suggestion => s !== null)
          .slice(0, 6)
      : [];

    return NextResponse.json({ suggestions });
  } catch {
    return NextResponse.json(
      { error: "Failed to generate suggestions" },
      { status: 500 },
    );
  }
}