import { createAdminSupabase } from "@/features/shared/lib/supabase/server";

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
 * We intentionally keep the DB mapping small & generic and push
 * most of the rich context into `payload`.
 */
export interface AITrainingEvent {
  /** Optional: let DB auto-generate if omitted */
  id?: string;

  /** High-level source / use-case for this training sample */
  source: AIRecordSource;

  /** Shop this sample belongs to (multi-tenant boundary) */
  shopId: string;

  /** Optional "YMM" string for grouping vehicle-specific training */
  vehicleYmm?: string | null;

  /** Arbitrary structured payload describing the event */
  payload: Record<string, unknown>;

  /** Optional: defaults to now() if omitted */
  createdAt?: string;
}

/**
 * Internal helper that knows how to actually write to ai_training_events.
 * We keep the column usage deliberately small so schema tweaks are cheap:
 *   - source        (text)
 *   - shop_id       (uuid)
 *   - vehicle_ymm   (text, nullable)
 *   - payload       (jsonb)
 *   - created_at    (timestamptz, default now())
 *   - id            (uuid, optional – DB can default)
 *
 * Any extra context (quoteId, workOrderId, sessionId, etc) lives in payload.
 */
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
    // NOTE: we deliberately avoid strict typing here because the
    // generated Database types may not yet include ai_training_events.
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

/* ======================================================================== */
/*  QUOTE TRAINING – APPLY AI QUOTE                                         */
/* ======================================================================== */

export type RecordQuoteTrainingInput = {
  /** Quote or line id that the AI suggestion was applied to */
  quoteId: string;

  /** Tenant boundary */
  shopId: string;

  /** Optional "YMM" string (e.g. "2017 Ford F-150") */
  vehicleYmm?: string | null;

  /** Optional: parent work order context (for analytics only) */
  workOrderId?: string | null;

  /** Optional: specific line id (for analytics only) */
  workOrderLineId?: string | null;

  /**
   * Caller-specific payload. We will automatically wrap this so we
   * always know this came from apply_ai_quote.
   */
  payload: Record<string, unknown>;

  createdAt?: string;
};

/**
 * Called when a user applies an AI quote suggestion.
 *
 * Example payload (caller decides fields):
 * {
 *   suggestion: {...raw AISuggestion from model...},
 *   unmatched: [...items user declined / edited...],
 *   complaint: "Customer states vibration at 100km/h",
 *   description: "Front brake inspection / road test"
 * }
 */
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

/* ======================================================================== */
/*  WORK ORDER TRAINING – INVOICE / JOB REVIEW                              */
/* ======================================================================== */

export type RecordWorkOrderTrainingInput = {
  workOrderId: string;
  workOrderLineId?: string | null;

  shopId: string;
  vehicleYmm?: string | null;

  /**
   * Caller payload, e.g.:
   * {
   *   lineItems: [...],
   *   totals: {...},
   *   technicianFindings: "...",
   *   aiSummary: "...",
   *   corrections: {...}   // how human changed AI suggestion
   * }
   */
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

/* ======================================================================== */
/*  INSPECTION → QUOTE TRAINING                                             */
/* ======================================================================== */

export type RecordInspectionToQuoteTrainingInput = {
  shopId: string;
  vehicleYmm?: string | null;

  /**
   * Caller payload, e.g.:
   * {
   *   inspectionSessionId: "...",
   *   inspectionId: "...",
   *   workOrderId: "...",
   *   workOrderLineId: "...",
   *   templateName: "Full CVIP",
   *   sections: [...raw inspection sections...],
   *   generatedQuote: {...quote object / lines...},
   *   userAdjustments: {...diff between AI quote & final quote...}
   * }
   */
  payload: Record<string, unknown>;

  createdAt?: string;
};

/**
 * Single, generic logger for the inspection → quote pipeline.
 * We'll call this from the inspection quote generator + any future
 * refinement UIs so the model can learn how humans edit its output.
 */
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