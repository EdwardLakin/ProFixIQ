import { openai } from "lib/server/openai";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

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

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      max_tokens: 600,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userContext },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Model gave non-JSON; let caller fall back.
      return null;
    }

    const out: QuoteEngineSuggestion = {
      parts: [],
      laborHours: 0.5,
      confidence: 0.4,
    };

    // --- parts ---
    const partsArr = Array.isArray((parsed as any)?.parts)
      ? (parsed as any).parts
      : [];

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
    const lh = (parsed as any)?.laborHours;
    if (typeof lh === "number" && Number.isFinite(lh) && lh > 0 && lh <= 8) {
      out.laborHours = lh;
    }

    // --- confidence ---
    const c = (parsed as any)?.confidence;
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

  const { id, source, shopId, vehicleYmm, payload, createdAt } = event;

  const { error } = await supabase.from("ai_training_events").insert({
    id,
    source,
    shop_id: shopId,
    vehicle_ymm: vehicleYmm ?? null,
    payload,
    created_at: createdAt ?? new Date().toISOString(),
  } as any);

  if (error) {
    // Never block the user flow on training errors; just log.
    // eslint-disable-next-line no-console
    console.error("[AI] Failed to insert training event", {
      source,
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
    payload,
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
    payload,
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
  const { shopId, vehicleYmm, payload, createdAt } = input;

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