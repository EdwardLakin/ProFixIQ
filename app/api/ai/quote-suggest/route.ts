// /app/api/ai/quote-suggest/route.ts (FULL FILE REPLACEMENT)
import "server-only";

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database, Json } from "@shared/types/types/supabase";
import { ProFixAI, type QuoteEnginePart } from "@/features/integrations/ai";

type DB = Database;

type ConfidenceLevel = "low" | "medium" | "high";

// Keep the response structured and easy to consume
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

  const year =
    vehicle.year !== undefined && vehicle.year !== null ? String(vehicle.year) : "";
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

async function resolveShopIdForUser(supabase: ReturnType<typeof createRouteHandlerClient<DB>>): Promise<{
  userId: string | null;
  shopId: string | null;
}> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const userId = user?.id ?? null;
  if (!userId) return { userId: null, shopId: null };

  // support both common profile key shapes
  const { data: byId } = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("id", userId)
    .maybeSingle<{ shop_id: string | null }>();
  if (byId?.shop_id) return { userId, shopId: byId.shop_id };

  const { data: byUserId } = await supabase
    .from("profiles")
    .select("shop_id")
    .eq("user_id", userId)
    .maybeSingle<{ shop_id: string | null }>();
  if (byUserId?.shop_id) return { userId, shopId: byUserId.shop_id };

  return { userId, shopId: null };
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

    const { userId, shopId } = await resolveShopIdForUser(supabase);

    const complaint = buildComplaint(body);
    const vehicleYmm = buildVehicleYmm(vehicle);

    // Call central AI engine (shopId optional for the AI itself)
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

    // ✅ Log safely:
    // Your ai_events.event_type allowed list does NOT include "quote_suggest".
    // Use "message" (allowed) and always include payload.
    if (shopId && userId) {
      try {
        const vehiclePayload =
          vehicle !== undefined && vehicle !== null
            ? {
                year: vehicle.year ?? null,
                make: vehicle.make ?? null,
                model: vehicle.model ?? null,
                vin: vehicle.vin ?? null,
              }
            : null;

        const payload: Json = {
          kind: "quote_suggest",
          input: {
            item,
            notes: notes ?? null,
            section,
            status,
            value: body.value ?? null,
            unit: body.unit ?? null,
            vehicle: vehiclePayload,
            complaint,
          },
          output: suggestion,
        };

        const { error: logErr } = await supabase.from("ai_events").insert({
          event_type: "message",
          payload,
          shop_id: shopId,
          user_id: userId,
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