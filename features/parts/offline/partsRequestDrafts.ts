"use client";

import {
  listOfflineSnapshots,
  removeOfflineSnapshots,
  saveOfflineSnapshot,
} from "@/features/shared/lib/offline/database";
import {
  runMutationWithOfflineQueue,
  type OfflineMutationScope,
} from "@/features/shared/lib/offline/mutations";

const KIND = "parts-request-draft";
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;

export type OfflinePartsRequestItem = {
  tempId: string;
  description: string;
  qty: number;
  partNumber?: string | null;
  manufacturer?: string | null;
};

export type OfflinePartsRequestDraft = {
  id: string;
  operationKey: string;
  userId: string;
  shopId: string;
  workOrderId: string | null;
  workOrderLineId: string | null;
  workOrderDraftId: string | null;
  tempLineId: string | null;
  notes: string;
  items: OfflinePartsRequestItem[];
  updatedAt: string;
};

export function createOfflinePartsRequestDraft(args: {
  scope: OfflineMutationScope;
  workOrderId?: string | null;
  workOrderLineId?: string | null;
  workOrderDraftId?: string | null;
  tempLineId?: string | null;
}): OfflinePartsRequestDraft {
  const id = crypto.randomUUID();
  return {
    id: `parts-draft:${id}`,
    operationKey: `parts-draft:${id}:materialize`,
    userId: args.scope.userId,
    shopId: args.scope.shopId,
    workOrderId: args.workOrderId ?? null,
    workOrderLineId: args.workOrderLineId ?? null,
    workOrderDraftId: args.workOrderDraftId ?? null,
    tempLineId: args.tempLineId ?? null,
    notes: "",
    items: [],
    updatedAt: new Date().toISOString(),
  };
}

export function createOfflinePartsRequestItem(): OfflinePartsRequestItem {
  return {
    tempId: `temp-part:${crypto.randomUUID()}`,
    description: "",
    qty: 1,
    partNumber: null,
    manufacturer: null,
  };
}

export async function saveOfflinePartsRequestDraft(
  draft: OfflinePartsRequestDraft,
): Promise<void> {
  await saveOfflineSnapshot({
    scope: { userId: draft.userId, shopId: draft.shopId },
    kind: KIND,
    entityId: draft.id,
    data: draft,
    maxAgeMs: MAX_AGE_MS,
  });
}

export async function listOfflinePartsRequestDrafts(
  scope: OfflineMutationScope,
): Promise<OfflinePartsRequestDraft[]> {
  const stored = await listOfflineSnapshots<OfflinePartsRequestDraft>({
    scope,
    kind: KIND,
  });
  return stored.map((item) => item.data);
}

export async function getOfflinePartsRequestDraft(args: {
  scope: OfflineMutationScope;
  workOrderId?: string | null;
  workOrderLineId?: string | null;
  workOrderDraftId?: string | null;
  tempLineId?: string | null;
}): Promise<OfflinePartsRequestDraft | null> {
  const drafts = await listOfflinePartsRequestDrafts(args.scope);
  return (
    drafts.find(
      (draft) =>
        (args.workOrderId == null || draft.workOrderId === args.workOrderId) &&
        (args.workOrderLineId == null ||
          draft.workOrderLineId === args.workOrderLineId) &&
        (args.workOrderDraftId == null ||
          draft.workOrderDraftId === args.workOrderDraftId) &&
        (args.tempLineId == null || draft.tempLineId === args.tempLineId),
    ) ?? null
  );
}

export async function removeOfflinePartsRequestDraft(args: {
  scope: OfflineMutationScope;
  draftId: string;
}): Promise<void> {
  await removeOfflineSnapshots({
    scope: args.scope,
    kind: KIND,
    entityIds: [args.draftId],
  });
}

export async function pruneDependentPartsRequestDrafts(args: {
  scope: OfflineMutationScope;
  workOrderDraftId: string;
  activeTempLineIds: string[];
}): Promise<void> {
  const active = new Set(args.activeTempLineIds);
  const stale = (await listOfflinePartsRequestDrafts(args.scope)).filter(
    (draft) =>
      draft.workOrderDraftId === args.workOrderDraftId &&
      draft.tempLineId != null &&
      !active.has(draft.tempLineId),
  );
  await Promise.all(
    stale.map((draft) =>
      removeOfflinePartsRequestDraft({
        scope: args.scope,
        draftId: draft.id,
      }),
    ),
  );
}

export async function postOfflinePartsRequestDraft(
  draft: OfflinePartsRequestDraft,
): Promise<{ requestId: string; idempotent: boolean }> {
  const response = await fetch("/api/offline/parts-request-drafts", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": draft.operationKey,
    },
    body: JSON.stringify(draft),
  });
  const body = (await response.json().catch(() => null)) as {
    requestId?: string;
    idempotent?: boolean;
    error?: string;
  } | null;
  if (!response.ok || !body?.requestId) {
    const error = new Error(
      body?.error ?? "Parts-request draft could not be submitted.",
    ) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return { requestId: body.requestId, idempotent: body.idempotent === true };
}

export async function submitOfflinePartsRequestDraft(
  draft: OfflinePartsRequestDraft,
): Promise<{
  queued: boolean;
  conflicted: boolean;
  requestId: string | null;
}> {
  if (!draft.workOrderId || !draft.workOrderLineId) {
    throw new Error("Parts request is still waiting for its work-order line.");
  }
  await saveOfflinePartsRequestDraft(draft);
  let requestId: string | null = null;
  const result = await runMutationWithOfflineQueue({
    clientMutationId: draft.operationKey,
    actionType: "parts-request:create-draft",
    payload: draft,
    scope: { userId: draft.userId, shopId: draft.shopId },
    orderKey: `${draft.workOrderId}:${draft.workOrderLineId}:parts:${draft.operationKey}`,
    runner: async () => {
      requestId = (await postOfflinePartsRequestDraft(draft)).requestId;
    },
  });
  if (!result.conflicted) {
    await removeOfflinePartsRequestDraft({
      scope: { userId: draft.userId, shopId: draft.shopId },
      draftId: draft.id,
    });
  }
  return { ...result, requestId };
}

export async function resolveAndSubmitDependentPartsDrafts(args: {
  scope: OfflineMutationScope;
  workOrderDraftId: string;
  workOrderId: string;
  lineIdMap: Record<string, string>;
}): Promise<{ submitted: number; queued: number }> {
  const drafts = (await listOfflinePartsRequestDrafts(args.scope)).filter(
    (draft) => draft.workOrderDraftId === args.workOrderDraftId,
  );
  let submitted = 0;
  let queued = 0;
  for (const draft of drafts) {
    const lineId = draft.tempLineId
      ? args.lineIdMap[draft.tempLineId]
      : draft.workOrderLineId;
    if (!lineId) {
      throw new Error(
        "A parts-request draft could not be matched to its saved job line.",
      );
    }
    const resolved: OfflinePartsRequestDraft = {
      ...draft,
      workOrderId: args.workOrderId,
      workOrderLineId: lineId,
      updatedAt: new Date().toISOString(),
    };
    await saveOfflinePartsRequestDraft(resolved);
    const result = await submitOfflinePartsRequestDraft(resolved);
    if (result.queued) queued += 1;
    else if (!result.conflicted) submitted += 1;
  }
  return { submitted, queued };
}
