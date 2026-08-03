"use client";

import type { InspectionSession } from "@inspections/lib/inspection/types";
import {
  getOfflineSnapshot,
  removeOfflineSnapshots,
  saveOfflineSnapshot,
} from "@/features/shared/lib/offline/database";
import {
  hydrateOfflineMutationQueue,
  listOfflineMutations,
  resolveOfflineMutationScope,
  retryOfflineMutation,
  type OfflineMutationScope,
} from "@/features/shared/lib/offline/mutations";

const KIND = "inspection-draft";
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 14;

function isLegacyInspectionWriterFailure(value: unknown): boolean {
  return (
    typeof value === "string" &&
    value
      .toLowerCase()
      .includes("no unique or exclusion constraint matching the on conflict")
  );
}

export type InspectionDraftRecoveryState = "editing" | "queued" | "conflicted";

export type InspectionOfflineDraft = {
  draftKey: string;
  session: InspectionSession;
  savedAt: string;
  state: InspectionDraftRecoveryState;
  operationKey?: string;
};

async function scopeFor(
  session: InspectionSession | Partial<InspectionSession>,
): Promise<OfflineMutationScope | null> {
  return resolveOfflineMutationScope({
    workOrderId: session.workOrderId,
    workOrderLineId: (
      session as InspectionSession & { workOrderLineId?: string | null }
    ).workOrderLineId,
  });
}

export async function saveInspectionOfflineDraft(args: {
  draftKey: string;
  session: InspectionSession;
  state?: InspectionDraftRecoveryState;
  operationKey?: string;
}): Promise<InspectionOfflineDraft | null> {
  const scope = await scopeFor(args.session);
  if (!scope) return null;
  const draft: InspectionOfflineDraft = {
    draftKey: args.draftKey,
    session: args.session,
    savedAt: new Date().toISOString(),
    state: args.state ?? "editing",
    operationKey: args.operationKey,
  };
  await saveOfflineSnapshot({
    scope,
    kind: KIND,
    entityId: args.draftKey,
    data: draft,
    maxAgeMs: MAX_AGE_MS,
  });
  return draft;
}

export async function getInspectionOfflineDraft(args: {
  draftKey: string;
  sessionHint: Partial<InspectionSession>;
}): Promise<InspectionOfflineDraft | null> {
  const scope = await scopeFor(args.sessionHint);
  if (!scope) return null;
  const snapshot = await getOfflineSnapshot<InspectionOfflineDraft>({
    scope,
    kind: KIND,
    entityId: args.draftKey,
  });
  if (!snapshot) return null;

  const draft = snapshot.data;
  if (draft.operationKey) {
    await hydrateOfflineMutationQueue();
    const queued = listOfflineMutations(scope).find(
      (mutation) => mutation.clientMutationId === draft.operationKey,
    );
    if (!queued) {
      const reconciled = {
        ...draft,
        state: "editing" as const,
        operationKey: undefined,
      };
      await saveInspectionOfflineDraft(reconciled);
      return reconciled;
    }
    if (queued.status === "synced") {
      // Keep the key until the autosave client retrieves the server's
      // idempotent acknowledgement and its canonical sync revision.
      const awaitingAcknowledgement = {
        ...draft,
        state: "queued" as const,
      };
      await saveInspectionOfflineDraft(awaitingAcknowledgement);
      return awaitingAcknowledgement;
    }
    const queuedSessionCandidate =
      (queued.payload && typeof queued.payload === "object"
        ? (queued.payload as { session?: Partial<InspectionSession> }).session
        : null) ?? null;
    const queuedSession =
      queuedSessionCandidate &&
      Array.isArray(queuedSessionCandidate.sections) &&
      queuedSessionCandidate.sections.length > 0
        ? (queuedSessionCandidate as InspectionSession)
        : null;
    if (queued.status === "conflicted") {
      if (isLegacyInspectionWriterFailure(queued.lastError)) {
        // Older clients mistook PostgreSQL's `ON CONFLICT` schema wording for
        // an inspection revision conflict. Revive only that known-safe failure
        // with the same payload and idempotency key; real revision conflicts
        // remain protected and require a canonical reconciliation path.
        await retryOfflineMutation(draft.operationKey);
        const retrying = {
          ...draft,
          session: queuedSession ?? draft.session,
          state: "queued" as const,
        };
        await saveInspectionOfflineDraft(retrying);
        return retrying;
      }
      // The queued payload is the exact device snapshot rejected by the
      // server. It is safer than a later screen/localStorage copy, which may
      // already have been replaced by a canonical load. Never dismiss or
      // rewrite this operation while it is conflicted.
      return {
        ...draft,
        session: queuedSession ?? draft.session,
        state: "conflicted",
      };
    }
  }
  return draft;
}

export async function removeInspectionOfflineDraft(args: {
  draftKey: string;
  session: Partial<InspectionSession>;
}): Promise<void> {
  const scope = await scopeFor(args.session);
  if (!scope) return;
  await removeOfflineSnapshots({
    scope,
    kind: KIND,
    entityIds: [args.draftKey],
  });
}

export async function appendInspectionPhotoToOfflineDraft(args: {
  scope: OfflineMutationScope;
  draftKey: string;
  sectionIndex: number;
  itemIndex: number;
  url: string;
}): Promise<boolean> {
  const snapshot = await getOfflineSnapshot<InspectionOfflineDraft>({
    scope: args.scope,
    kind: KIND,
    entityId: args.draftKey,
  });
  if (!snapshot) return false;

  const sections = [...(snapshot.data.session.sections ?? [])];
  const section = sections[args.sectionIndex];
  const item = section?.items?.[args.itemIndex];
  if (!section || !item) return false;
  const photoUrls = Array.isArray(item.photoUrls) ? item.photoUrls : [];
  if (photoUrls.includes(args.url)) return true;
  const items = [...section.items];
  items[args.itemIndex] = { ...item, photoUrls: [...photoUrls, args.url] };
  sections[args.sectionIndex] = { ...section, items };
  const session = {
    ...snapshot.data.session,
    sections,
    lastUpdated: new Date().toISOString(),
  };
  await saveOfflineSnapshot({
    scope: args.scope,
    kind: KIND,
    entityId: args.draftKey,
    data: { ...snapshot.data, session, savedAt: new Date().toISOString() },
    maxAgeMs: MAX_AGE_MS,
  });
  return true;
}
