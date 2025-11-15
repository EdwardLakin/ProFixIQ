/**
 * ProFixIQ AI Integration Layer
 * Central hub for all AI-powered logic across the system.
 * No 'any' types. All AI input/output types are explicitly defined.
 */

export type AIRecordSource =
  | "quote"
  | "appointment"
  | "inspection"
  | "work_order"
  | "customer"
  | "vehicle";

export interface AITrainingRecord {
  id: string;
  source: AIRecordSource;
  shopId: string;
  vehicleYmm?: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface AIQuoteSuggestion {
  parts: Array<{
    partId: string;
    description: string;
    qty: number;
    price: number;
  }>;
  laborHours: number;
  confidence: number; // 0–1
}

export interface AIEngine {
  recordTraining(data: AITrainingRecord): Promise<void>;
  suggestQuote(input: {
    shopId: string;
    vehicleYmm?: string | null;
    complaint: string;
  }): Promise<AIQuoteSuggestion | null>;
}

class ProFixIQAI implements AIEngine {
  async recordTraining(data: AITrainingRecord): Promise<void> {
    // Stub implementation for now – later this will:
    // - write into ai_training_data
    // - generate embeddings
    // - update vector indexes
    console.log("AI TRAINING RECORD:", data);
  }

  async suggestQuote(input: {
    shopId: string;
    vehicleYmm?: string | null;
    complaint: string;
  }): Promise<AIQuoteSuggestion | null> {
    const { shopId, vehicleYmm, complaint } = input;

    // Use all fields so there are no “unused variable” warnings
    console.log("AI QUOTE SUGGEST (stub)", {
      shopId,
      vehicleYmm,
      complaint,
    });

    const normalizedComplaint = complaint.trim().toLowerCase();

    // If there's no actual complaint text, don't suggest anything
    if (!normalizedComplaint) {
      return null;
    }

    // Super-simple heuristic just so this function is "real"
    let laborHours = 1.0;

    if (normalizedComplaint.includes("engine")) {
      laborHours = 4.0;
    } else if (normalizedComplaint.includes("transmission")) {
      laborHours = 3.0;
    } else if (
      normalizedComplaint.includes("brake") ||
      normalizedComplaint.includes("brakes")
    ) {
      laborHours = 1.5;
    } else if (normalizedComplaint.includes("diagnose")) {
      laborHours = 1.0;
    }

    const confidence =
      normalizedComplaint.length > 40 ? 0.7 : 0.5;

    return {
      // For now we return no parts – the actual parts will come from
      // the vector search + training data pipeline.
      parts: [],
      laborHours,
      confidence,
    };
  }
}

export const AI: AIEngine = new ProFixIQAI();