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
  type OfflineMutationScope,
} from "@/features/shared/lib/offline/mutations";

const KIND = "inspection-draft";
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 14;

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
    if (!queued || queued.status === "synced") {
      const reconciled = {
        ...draft,
        state: "editing" as const,
        operationKey: undefined,
      };
      await saveInspectionOfflineDraft(reconciled);
      return reconciled;
    }
    if (queued.status === "conflicted") {
      return { ...draft, state: "conflicted" };
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
