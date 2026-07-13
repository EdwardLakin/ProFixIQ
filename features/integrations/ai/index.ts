

async function getRuntimeOpenAIClient() {
  const { getOpenAIClient } = await import("@/features/shared/lib/server/openai");
  return getOpenAIClient();
}

//features/integrations/ai/index.ts

import { getOpenAIModelForPurpose, openAITemperatureParam } from "@/features/shared/lib/server/openai-models";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import type { Json } from "@/features/shared/types/types/supabase";
/* ========================================================================== */
/*  QUOTE ENGINE – CENTRAL AI ENTRYPOINT                                      */
/* ========================================================================== */

export type QuoteEnginePart = {
  partId?: string | null;
  description: string;
  qty?: number;
  price?: number;
};

export type QuoteEngineSuggestion = {
  parts: QuoteEnginePart[];
  laborHours: number;
  confidence: number; // 0–1
};

type SuggestQuoteArgs = {
  shopId: string;
  vehicleYmm?: string | null;
  complaint: string;
};

export const ProFixAI = {
  /**
   * LLM-backed quote suggestion.
   * Returns null on any parsing / API failure so callers can fall back.
   */
  async suggestQuote(
    args: SuggestQuoteArgs,
  ): Promise<QuoteEngineSuggestion | null> {
    const { shopId, vehicleYmm, complaint } = args;

    const system = [
      "You are an auto repair quote assistant.",
      "Given a vehicle (Y/M/M) and a complaint, you must return JSON ONLY.",
      "The JSON must be an object with:",
      "- parts: array of { description, qty, price, partId },",
      "- laborHours: number (0.1–8),",
      "- confidence: number between 0 and 1.",
      "Keep parts realistic; at most 10 parts.",
      "Do not include any prose or markdown, only raw JSON.",
    ].join(" ");

    const userContext = [
      `Shop: ${shopId}`,
      `Vehicle: ${vehicleYmm ?? "Unknown vehicle"}`,
      `Complaint: ${complaint}`,
    ].join("\n");

    const model = getOpenAIModelForPurpose("fast");

    let parsed: unknown;
    try {
      const response = await (await getRuntimeOpenAIClient()).responses.create({
        model,
        ...openAITemperatureParam(model, 0.4),
        max_output_tokens: 600,
        text: {
          format: { type: "json_object" },
        },
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: system }],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: userContext }],
          },
        ],
      });

      const raw = response.output_text?.trim() ?? "{}";
      parsed = JSON.parse(raw);
    } catch (error) {
      const upstream = error as {
        code?: unknown;
        param?: unknown;
        message?: unknown;
        status?: unknown;
        type?: unknown;
      };
      console.warn("[AI] quote suggestion unavailable", {
        endpoint: "responses.create",
        model,
        status: typeof upstream.status === "number" ? upstream.status : undefined,
        code: typeof upstream.code === "string" ? upstream.code : undefined,
        parameter: typeof upstream.param === "string" ? upstream.param : undefined,
        type: typeof upstream.type === "string" ? upstream.type : undefined,
        message:
          typeof upstream.message === "string"
            ? upstream.message.slice(0, 240)
            : "OpenAI request failed",
      });
      return null;
    }

    const out: QuoteEngineSuggestion = {
      parts: [],
      laborHours: 0.5,
      confidence: 0.4,
    };

    // --- parts ---
    const parsedParts = (parsed as { parts?: unknown }).parts;
    const partsArr: unknown[] = Array.isArray(parsedParts) ? parsedParts : [];

    const normalizedParts: QuoteEnginePart[] = [];
    for (const rawPart of partsArr) {
      if (typeof rawPart !== "object" || rawPart === null) continue;
      const p = rawPart as Record<string, unknown>;

      const description =
        typeof p.description === "string" && p.description.trim().length > 0
          ? p.description.trim()
          : null;
      if (!description) continue;

      const qtyRaw = p.qty;
      const qty =
        typeof qtyRaw === "number" && Number.isFinite(qtyRaw) && qtyRaw > 0
          ? qtyRaw
          : undefined;

      const priceRaw = p.price;
      const price =
        typeof priceRaw === "number" &&
        Number.isFinite(priceRaw) &&
        priceRaw >= 0
          ? priceRaw
          : undefined;

      const partIdRaw = p.partId;
      const partId =
        typeof partIdRaw === "string" && partIdRaw.trim().length > 0
          ? partIdRaw.trim()
          : null;

      const part: QuoteEnginePart = {
        description,
      };

      if (qty !== undefined) part.qty = qty;
      if (price !== undefined) part.price = price;
      if (partId !== null) part.partId = partId;

      normalizedParts.push(part);
    }

    out.parts = normalizedParts.slice(0, 10);

    // --- laborHours ---
    const lh = (parsed as { laborHours?: unknown }).laborHours;
    if (typeof lh === "number" && Number.isFinite(lh) && lh > 0 && lh <= 8) {
      out.laborHours = lh;
    }

    // --- confidence ---
    const c = (parsed as { confidence?: unknown }).confidence;
    if (typeof c === "number" && Number.isFinite(c) && c >= 0 && c <= 1) {
      out.confidence = c;
    }

    return out;
  },
};

/* ========================================================================== */
/*  TRAINING EVENT LOGGING                                                    */
/* ========================================================================== */

/**
 * Narrow string sources so we don't end up with random ad-hoc values.
 * These map roughly to the things we care about training:
 * - apply_ai_quote: AI suggestion applied to a quote/line
 * - invoice_review: AI work-order / invoice review
 * - inspection_to_quote: inspection → quote pipeline
 * - menu_learning: future menu-learning events
 * - chat: future TechBot / InspectionBot chat turns
 */
export type AIRecordSource =
  | "apply_ai_quote"
  | "invoice_review"
  | "inspection_to_quote"
  | "menu_learning"
  | "chat";

/**
 * Minimal, DB-agnostic training event shape that callers work with.
 */
export interface AITrainingEvent {
  id?: string;
  source: AIRecordSource;
  shopId: string;
  vehicleYmm?: string | null;
  payload: Record<string, unknown>;
  createdAt?: string;
}

async function insertTrainingEvent(event: AITrainingEvent): Promise<void> {
  const supabase = createAdminSupabase();

  const { id, source, shopId, payload } = event;
  const eventPayload: Json = {
    id: id ?? null,
    trainingSource: source,
    vehicleYmm: event.vehicleYmm ?? null,
    createdAt: event.createdAt ?? new Date().toISOString(),
    payload: payload as Json,
  };

  const { error } = await supabase.rpc("insert_ai_event", {
    p_event_type: "training.event",
    p_payload: eventPayload,
    p_shop_id: shopId,
    p_training_source: source,
  });

  if (error) {
    // Never block the user flow on training errors; just log.
    // eslint-disable-next-line no-console
    console.error("[AI] Failed to insert training event", {
      trainingSource: source,
      shopId,
      error,
    });
  }
}

/* ---------- QUOTE TRAINING – APPLY AI QUOTE ---------- */

export type RecordQuoteTrainingInput = {
  quoteId: string;
  shopId: string;
  vehicleYmm?: string | null;
  workOrderId?: string | null;
  workOrderLineId?: string | null;
  payload: Record<string, unknown>;
  createdAt?: string;
};

export async function recordQuoteTraining(
  input: RecordQuoteTrainingInput,
): Promise<void> {
  const {
    quoteId,
    shopId,
    vehicleYmm,
    workOrderId,
    workOrderLineId,
    payload: payload,
    createdAt,
  } = input;

  await insertTrainingEvent({
    source: "apply_ai_quote",
    shopId,
    vehicleYmm: vehicleYmm ?? null,
    createdAt,
    payload: {
      kind: "apply_ai_quote",
      quoteId,
      workOrderId: workOrderId ?? null,
      workOrderLineId: workOrderLineId ?? null,
      ...(payload ?? {}),
    },
  });
}

/* ---------- WORK ORDER TRAINING – INVOICE / JOB REVIEW ---------- */

export type RecordWorkOrderTrainingInput = {
  workOrderId: string;
  workOrderLineId?: string | null;
  shopId: string;
  vehicleYmm?: string | null;
  payload: Record<string, unknown>;
  createdAt?: string;
};

export async function recordWorkOrderTraining(
  input: RecordWorkOrderTrainingInput,
): Promise<void> {
  const {
    workOrderId,
    workOrderLineId,
    shopId,
    vehicleYmm,
    payload: payload,
    createdAt,
  } = input;

  await insertTrainingEvent({
    source: "invoice_review",
    shopId,
    vehicleYmm: vehicleYmm ?? null,
    createdAt,
    payload: {
      kind: "invoice_review",
      workOrderId,
      workOrderLineId: workOrderLineId ?? null,
      ...(payload ?? {}),
    },
  });
}

/* ---------- INSPECTION → QUOTE TRAINING ---------- */

export type RecordInspectionToQuoteTrainingInput = {
  shopId: string;
  vehicleYmm?: string | null;
  payload: Record<string, unknown>;
  createdAt?: string;
};

export async function recordInspectionToQuoteTraining(
  input: RecordInspectionToQuoteTrainingInput,
): Promise<void> {
  const { shopId, vehicleYmm, payload: payload, createdAt } = input;

  await insertTrainingEvent({
    source: "inspection_to_quote",
    shopId,
    vehicleYmm: vehicleYmm ?? null,
    createdAt,
    payload: {
      kind: "inspection_to_quote",
      ...(payload ?? {}),
    },
  });
}
