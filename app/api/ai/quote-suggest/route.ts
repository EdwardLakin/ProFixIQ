// /app/api/ai/quote-suggest/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database, Json } from "@shared/types/types/supabase";
import { ProFixAI, type QuoteEnginePart } from "@/features/integrations/ai";

type DB = Database;

type ConfidenceLevel = "low" | "medium" | "high";

export type AISuggestion = {
  parts: { name: string; qty?: number; cost?: number; notes?: string }[];
  laborHours: number;
  laborRate?: number;
  summary: string;
  confidence?: ConfidenceLevel;
  price?: number;
  notes?: string;
  title?: string;
};

interface VehicleInput {
  year?: string | number | null;
  make?: string | null;
  model?: string | null;
  vin?: string | null;
}

interface RequestBody {
  item: string;
  notes?: string;
  section: string;
  status: string;
  value?: string;
  unit?: string;
  vehicle?: VehicleInput | null;
}

function isRequestBody(value: unknown): value is RequestBody {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.item === "string" &&
    typeof obj.section === "string" &&
    typeof obj.status === "string"
  );
}

function mapConfidence(score: number): ConfidenceLevel {
  if (score >= 0.75) return "high";
  if (score >= 0.5) return "medium";
  return "low";
}

function buildVehicleYmm(vehicle?: VehicleInput | null): string | null {
  if (!vehicle) return null;
  const year = vehicle.year != null ? String(vehicle.year) : "";
  const make = vehicle.make ?? "";
  const model = vehicle.model ?? "";
  const combined = [year, make, model].join(" ").trim();
  return combined.length > 0 ? combined : null;
}

function buildComplaint(input: RequestBody): string {
  const parts: string[] = [];
  if (input.section) parts.push(`[${input.section}]`);
  if (input.status) parts.push(`Status: ${input.status}`);
  parts.push(input.item);

  if (typeof input.notes === "string" && input.notes.trim().length > 0) {
    parts.push(`Notes: ${input.notes.trim()}`);
  }

  if (input.value) {
    const valuePart = input.unit ? `${input.value} ${input.unit}` : input.value;
    parts.push(`Value: ${valuePart}`);
  }

  return parts.join(" | ");
}

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient<DB>({ cookies });

  try {
    const rawBody: unknown = await req.json();
    if (!isRequestBody(rawBody)) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const body: RequestBody = rawBody;
    const { item, notes, section, status, vehicle } = body;

    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Resolve shopId (best-effort)
    let shopId: string | null = null;
    if (user?.id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("shop_id")
        .eq("id", user.id)
        .maybeSingle<{ shop_id: string | null }>();

      shopId = profile?.shop_id ?? null;
    }

    const complaint = buildComplaint(body);
    const vehicleYmm = buildVehicleYmm(vehicle);

    const aiResult = await ProFixAI.suggestQuote({
      shopId: shopId ?? "unknown_shop",
      vehicleYmm,
      complaint,
    });

    const baseSummary =
      typeof notes === "string" && notes.trim().length > 0 ? notes.trim() : item;

    const suggestion: AISuggestion = aiResult
      ? {
          parts: aiResult.parts.map((p: QuoteEnginePart) => ({
            name: p.description || "Suggested part",
            qty: p.qty,
            cost: p.price,
            notes: p.partId ? `Part ID: ${p.partId}` : undefined,
          })),
          laborHours: aiResult.laborHours,
          summary: baseSummary,
          confidence: mapConfidence(aiResult.confidence),
        }
      : {
          parts: [],
          laborHours: 0.5,
          summary: baseSummary,
          confidence: "low",
        };

    // ✅ Log using a VALID event_type to avoid 400s (your enum/check constraint)
    if (shopId && user?.id) {
      try {
        const payload: Json = {
          kind: "quote_suggest",
          input: {
            item,
            notes: notes ?? null,
            section,
            status,
            value: body.value ?? null,
            unit: body.unit ?? null,
            vehicle: vehicle ?? null,
            complaint,
          },
          output: suggestion,
        } as unknown as Json;

        const { error: logErr } = await supabase.from("ai_events").insert({
          event_type: "message", // ✅ valid in your allowed list
          payload,
          shop_id: shopId,
          user_id: user.id,
          entity_id: null,
          entity_table: "inspection_results",
        });

        if (logErr) {
          // eslint-disable-next-line no-console
          console.warn("[AI] Failed to log quote-suggest event:", logErr);
        }
      } catch (logErr) {
        // eslint-disable-next-line no-console
        console.warn("[AI] Failed to log quote-suggest event:", logErr);
      }
    }

    return NextResponse.json({ suggestion });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("quote-suggest error:", err);
    return NextResponse.json({ error: "AI suggestion failed" }, { status: 500 });
  }
}