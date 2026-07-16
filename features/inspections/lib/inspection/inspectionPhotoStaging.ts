"use client";

import {
  getOfflineBlob,
  removeOfflineBlob,
  saveOfflineBlob,
  type OfflineBlobRecord,
} from "@/features/shared/lib/offline/database";
import {
  hydrateOfflineMutationQueue,
  listOfflineMutations,
  resolveOfflineMutationScope,
  runMutationWithOfflineQueue,
  type OfflineMutationScope,
  type OfflineMutationStatus,
  type PendingMutation,
} from "@/features/shared/lib/offline/mutations";
import { appendInspectionPhotoToOfflineDraft } from "@inspections/lib/inspection/offlineDrafts";

export const INSPECTION_PHOTO_ACTION = "inspection:upload-photo";
export const INSPECTION_PHOTO_SYNCED_EVENT = "inspection:photo-synced";

export type InspectionPhotoPayload = {
  blobId: string;
  draftKey: string;
  inspectionId: string;
  workOrderId?: string | null;
  workOrderLineId: string;
  itemName?: string | null;
  sectionIndex: number;
  itemIndex: number;
  fileName: string;
  mimeType: string;
};

export type StagedInspectionPhoto = {
  clientMutationId: string;
  blob: Blob;
  fileName: string;
  status: OfflineMutationStatus;
};

function operationId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `inspection-photo:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

function isInspectionPhotoPayload(
  value: unknown,
): value is InspectionPhotoPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<InspectionPhotoPayload>;
  return Boolean(
    payload.blobId &&
    payload.draftKey &&
    payload.inspectionId &&
    payload.workOrderLineId &&
    Number.isInteger(payload.sectionIndex) &&
    Number.isInteger(payload.itemIndex),
  );
}

async function uploadInspectionPhoto(
  payload: InspectionPhotoPayload,
  blob: Blob,
  operationKey: string,
): Promise<string> {
  const form = new FormData();
  form.set("inspectionId", payload.inspectionId);
  form.set("workOrderLineId", payload.workOrderLineId);
  if (payload.workOrderId) form.set("workOrderId", payload.workOrderId);
  if (payload.itemName) form.set("itemName", payload.itemName);
  form.set(
    "file",
    new File([blob], payload.fileName, { type: payload.mimeType }),
  );

  const response = await fetch("/api/inspections/photos/upload", {
    method: "POST",
    credentials: "include",
    headers: { "Idempotency-Key": operationKey },
    body: form,
  });
  const json = (await response.json().catch(() => null)) as {
    error?: string;
    url?: string;
  } | null;
  if (!response.ok || !json?.url) {
    const error = new Error(
      json?.error ?? "Inspection photo upload failed",
    ) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return json.url;
}

async function applyUploadedPhoto(args: {
  payload: InspectionPhotoPayload;
  scope: OfflineMutationScope;
  operationKey: string;
  url: string;
  notify: boolean;
}): Promise<void> {
  await appendInspectionPhotoToOfflineDraft({
    scope: args.scope,
    draftKey: args.payload.draftKey,
    sectionIndex: args.payload.sectionIndex,
    itemIndex: args.payload.itemIndex,
    url: args.url,
  });
  if (args.notify && typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(INSPECTION_PHOTO_SYNCED_EVENT, {
        detail: {
          clientMutationId: args.operationKey,
          draftKey: args.payload.draftKey,
          sectionIndex: args.payload.sectionIndex,
          itemIndex: args.payload.itemIndex,
          url: args.url,
        },
      }),
    );
  }
}

export async function stageInspectionPhoto(args: {
  draftKey: string;
  inspectionId: string;
  workOrderId?: string | null;
  workOrderLineId: string;
  itemName?: string | null;
  sectionIndex: number;
  itemIndex: number;
  file: File;
}): Promise<{
  clientMutationId: string;
  queued: boolean;
  conflicted: boolean;
  url?: string;
}> {
  const scope = await resolveOfflineMutationScope({
    workOrderId: args.workOrderId,
    workOrderLineId: args.workOrderLineId,
  });
  if (!scope) {
    throw new Error(
      "Offline shop scope is unavailable. Reconnect and try again.",
    );
  }

  const clientMutationId = operationId();
  const payload: InspectionPhotoPayload = {
    blobId: clientMutationId,
    draftKey: args.draftKey,
    inspectionId: args.inspectionId,
    workOrderId: args.workOrderId,
    workOrderLineId: args.workOrderLineId,
    itemName: args.itemName,
    sectionIndex: args.sectionIndex,
    itemIndex: args.itemIndex,
    fileName: args.file.name,
    mimeType: args.file.type || "image/jpeg",
  };
  await saveOfflineBlob({
    id: clientMutationId,
    userId: scope.userId,
    shopId: scope.shopId,
    createdAt: new Date().toISOString(),
    fileName: payload.fileName,
    mimeType: payload.mimeType,
    blob: args.file,
  });

  let uploadedUrl: string | undefined;
  try {
    const result = await runMutationWithOfflineQueue({
      clientMutationId,
      actionType: INSPECTION_PHOTO_ACTION,
      payload,
      scope,
      orderKey: `${args.workOrderLineId}:inspection-photo:${clientMutationId}`,
      runner: async () => {
        uploadedUrl = await uploadInspectionPhoto(
          payload,
          args.file,
          clientMutationId,
        );
      },
    });
    if (!result.queued && uploadedUrl) {
      await applyUploadedPhoto({
        payload,
        scope,
        operationKey: clientMutationId,
        url: uploadedUrl,
        notify: false,
      });
      await removeOfflineBlob(clientMutationId);
    }
    return { clientMutationId, ...result, url: uploadedUrl };
  } catch (error) {
    await removeOfflineBlob(clientMutationId);
    throw error;
  }
}

export async function replayInspectionPhotoMutation(
  mutation: PendingMutation,
): Promise<{ conflicted?: string } | void> {
  if (!isInspectionPhotoPayload(mutation.payload)) {
    return {
      conflicted: "Inspection photo is missing its item or staged file.",
    };
  }
  const record = await getOfflineBlob(mutation.payload.blobId);
  if (
    !record ||
    record.userId !== mutation.userId ||
    record.shopId !== mutation.shopId
  ) {
    return {
      conflicted: "The staged inspection photo is no longer available.",
    };
  }
  const url = await uploadInspectionPhoto(
    mutation.payload,
    record.blob,
    mutation.clientMutationId,
  );
  await applyUploadedPhoto({
    payload: mutation.payload,
    scope: { userId: mutation.userId, shopId: mutation.shopId },
    operationKey: mutation.clientMutationId,
    url,
    notify: true,
  });
  await removeOfflineBlob(mutation.payload.blobId);
}

export async function listStagedInspectionPhotos(args: {
  draftKey: string;
  sectionIndex: number;
  itemIndex: number;
}): Promise<StagedInspectionPhoto[]> {
  await hydrateOfflineMutationQueue();
  const mutations = listOfflineMutations().filter((mutation) => {
    if (
      mutation.actionType !== INSPECTION_PHOTO_ACTION ||
      mutation.status === "synced" ||
      !isInspectionPhotoPayload(mutation.payload)
    ) {
      return false;
    }
    return (
      mutation.payload.draftKey === args.draftKey &&
      mutation.payload.sectionIndex === args.sectionIndex &&
      mutation.payload.itemIndex === args.itemIndex
    );
  });
  const records = await Promise.all(
    mutations.map(async (mutation) => ({
      mutation,
      record: await getOfflineBlob(
        (mutation.payload as InspectionPhotoPayload).blobId,
      ),
    })),
  );
  return records
    .filter(
      (
        entry,
      ): entry is {
        mutation: PendingMutation<InspectionPhotoPayload>;
        record: OfflineBlobRecord;
      } => Boolean(entry.record),
    )
    .map(({ mutation, record }) => ({
      clientMutationId: mutation.clientMutationId,
      blob: record.blob,
      fileName: record.fileName,
      status: mutation.status,
    }));
}

export async function getPendingInspectionPhotoCount(
  draftKey: string,
): Promise<number> {
  await hydrateOfflineMutationQueue();
  return listOfflineMutations().filter(
    (mutation) =>
      mutation.actionType === INSPECTION_PHOTO_ACTION &&
      mutation.status !== "synced" &&
      isInspectionPhotoPayload(mutation.payload) &&
      mutation.payload.draftKey === draftKey,
  ).length;
}
