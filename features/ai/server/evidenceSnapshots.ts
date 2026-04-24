import type { Json } from "@shared/types/types/supabase";
import {
  type AiActorContext,
  type AiEvidenceSnapshotRecord,
  assertNonEmpty,
  ensureActorContext,
  fromTable,
  normalizeArrayJson,
  normalizeObjectJson,
  type AiServerClient,
  validateConfidence,
} from "./types";
import { logAiActionEvent } from "./actionEvents";

type CreateAiEvidenceSnapshotInput = {
  subjectType: string;
  subjectId?: string | null;
  domain: string;
  evidenceKind: string;
  snapshot?: Json;
  sourceRefs?: Json;
  missingData?: Json;
  freshnessAt?: string | null;
  confidence?: number | null;
  metadata?: Json;
};

export async function createAiEvidenceSnapshot(
  supabase: AiServerClient,
  actor: AiActorContext,
  input: CreateAiEvidenceSnapshotInput,
): Promise<AiEvidenceSnapshotRecord> {
  const ctx = ensureActorContext(actor);

  const insertPayload = {
    shop_id: ctx.shopId,
    subject_type: assertNonEmpty(input.subjectType, "subjectType"),
    subject_id: input.subjectId ?? null,
    domain: assertNonEmpty(input.domain, "domain"),
    evidence_kind: assertNonEmpty(input.evidenceKind, "evidenceKind"),
    snapshot: normalizeObjectJson(input.snapshot),
    source_refs: normalizeArrayJson(input.sourceRefs),
    missing_data: normalizeArrayJson(input.missingData),
    freshness_at: input.freshnessAt ?? null,
    confidence: validateConfidence(input.confidence),
    created_by: ctx.actorId,
    metadata: normalizeObjectJson(input.metadata),
  };

  const { data, error } = await fromTable(supabase, "ai_evidence_snapshots")
    .insert(insertPayload)
    .select("*")
    .single<AiEvidenceSnapshotRecord>();

  if (error) throw new Error(error.message);

  await logAiActionEvent(supabase, ctx, {
    eventType: "evidence.created",
    payload: {
      evidence_snapshot_id: data.id,
      domain: data.domain,
      evidence_kind: data.evidence_kind,
      subject_type: data.subject_type,
      subject_id: data.subject_id,
    },
  });

  return data;
}

export async function getAiEvidenceSnapshot(
  supabase: AiServerClient,
  actor: AiActorContext,
  snapshotId: string,
): Promise<AiEvidenceSnapshotRecord | null> {
  const ctx = ensureActorContext(actor);

  const { data, error } = await fromTable(supabase, "ai_evidence_snapshots")
    .select("*")
    .eq("shop_id", ctx.shopId)
    .eq("id", snapshotId)
    .maybeSingle<AiEvidenceSnapshotRecord>();

  if (error) throw new Error(error.message);
  return data;
}

export async function listAiEvidenceSnapshotsForSubject(
  supabase: AiServerClient,
  actor: AiActorContext,
  input: {
    subjectType: string;
    subjectId?: string | null;
    domain?: string;
    limit?: number;
  },
): Promise<AiEvidenceSnapshotRecord[]> {
  const ctx = ensureActorContext(actor);

  let query = fromTable(supabase, "ai_evidence_snapshots")
    .select("*")
    .eq("shop_id", ctx.shopId)
    .eq("subject_type", assertNonEmpty(input.subjectType, "subjectType"))
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(input.limit ?? 50, 1), 200));

  if (input.subjectId) {
    query = query.eq("subject_id", input.subjectId);
  }

  if (input.domain) {
    query = query.eq("domain", input.domain);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);
  return (data ?? []) as AiEvidenceSnapshotRecord[];
}
