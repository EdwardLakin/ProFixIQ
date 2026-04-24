import type { AiActorContext, AiServerClient } from "../types";

export type ExpirationCounts = {
  candidates: number;
  expired: number;
  candidateIds: string[];
};

export type ExpireStaleAiRecordsResult = {
  dryRun: boolean;
  now: string;
  recommendations: ExpirationCounts;
  previews: ExpirationCounts;
  approvals: ExpirationCounts;
  warnings: string[];
};

export type ExpireStaleAiRecordsInput = {
  supabase: AiServerClient;
  now?: Date;
  shopId?: string;
  dryRun?: boolean;
  limit?: number;
  actorContext?: AiActorContext;
};
