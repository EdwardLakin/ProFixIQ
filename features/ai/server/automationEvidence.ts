import type { Json } from "@shared/types/types/supabase";
import { createAdminSupabase } from "@/features/shared/lib/supabase/server";
import type { AiAutomationCapability, AiAutomationEvidenceOutcome } from "../automation/types";

export async function recordAutomationEvidence(args: {
  shopId: string;
  capability: AiAutomationCapability;
  evidenceKey: string;
  outcome: AiAutomationEvidenceOutcome;
  source: string;
  sourceEntityType?: string | null;
  sourceEntityId?: string | null;
  metadata?: Json;
  recordedBy?: string | null;
  occurredAt?: string;
}): Promise<void> {
  const { error } = await createAdminSupabase().from("ai_automation_evidence").upsert({
    shop_id: args.shopId,
    capability: args.capability,
    evidence_key: args.evidenceKey,
    outcome: args.outcome,
    source: args.source,
    source_entity_type: args.sourceEntityType ?? null,
    source_entity_id: args.sourceEntityId ?? null,
    metadata: args.metadata ?? {},
    recorded_by: args.recordedBy ?? null,
    occurred_at: args.occurredAt ?? new Date().toISOString(),
  }, { onConflict: "shop_id,capability,evidence_key" });
  if (error) throw error;
}
