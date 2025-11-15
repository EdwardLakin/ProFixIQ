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
    console.log("AI TRAINING RECORD:", data);
  }

  async suggestQuote(input: {
    shopId: string;
    vehicleYmm?: string | null;
    complaint: string;
  }): Promise<AIQuoteSuggestion | null> {
    return {
      parts: [],
      laborHours: 1.0,
      confidence: 0.5,
    };
  }
}

export const AI = new ProFixIQAI();
