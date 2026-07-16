"use client";

import {
  getOfflineSnapshot,
  listOfflineSnapshots,
  removeOfflineSnapshots,
  saveOfflineSnapshot,
} from "@/features/shared/lib/offline/database";
import type { OfflineMutationScope } from "@/features/shared/lib/offline/mutations";
import type {
  AdvisorDraftMaterialization,
  AdvisorOfflineBundle,
  AdvisorWorkOrderDraft,
  AdvisorWorkOrderDraftLine,
} from "@/features/work-orders/mobile/advisorOfflineTypes";

const DAY_KIND = "advisor-offline-day";
const DRAFT_KIND = "advisor-work-order-draft";
const MATERIALIZATION_KIND = "advisor-draft-materialization";
const CURRENT_DRAFT_ID = "current";
const ADVISOR_SHELL_CACHE = "profixiq-advisor-shell-v1";
const DRAFT_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;

export function createAdvisorDraftId(): string {
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `advisor-draft:${id}`;
}

export function createAdvisorDraftLine(
  input: Omit<AdvisorWorkOrderDraftLine, "tempId">,
): AdvisorWorkOrderDraftLine {
  const id =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { ...input, tempId: `temp-line:${id}` };
}

async function cacheAdvisorRouteShells(bundle: AdvisorOfflineBundle) {
  if (typeof caches === "undefined" || !navigator.serviceWorker?.controller)
    return;
  const cache = await caches.open(ADVISOR_SHELL_CACHE);
  const urls = [
    `/mobile/appointments?shop=${encodeURIComponent(bundle.shop.slug ?? "")}`,
    "/mobile/work-orders/create",
  ];
  await Promise.all(
    urls.map(async (url) => {
      const response = await fetch(url, {
        credentials: "include",
        headers: { Accept: "text/html" },
      });
      if (response.ok) await cache.put(url, response.clone());
    }),
  );
}

export async function downloadAdvisorOfflineDay(day: string) {
  const response = await fetch(
    `/api/offline/advisor-day?day=${encodeURIComponent(day)}`,
    { credentials: "include", cache: "no-store" },
  );
  const body = (await response.json().catch(() => null)) as
    | AdvisorOfflineBundle
    | { error?: string }
    | null;
  if (!response.ok || !body || !("scope" in body)) {
    throw new Error(
      (body && "error" in body && body.error) ||
        "Advisor offline data could not be downloaded.",
    );
  }
  await saveOfflineSnapshot({
    scope: body.scope,
    kind: DAY_KIND,
    entityId: body.day,
    data: body,
  });
  await cacheAdvisorRouteShells(body);
  return body;
}

export async function getCachedAdvisorDay(args: {
  scope: OfflineMutationScope;
  day: string;
}): Promise<AdvisorOfflineBundle | null> {
  const stored = await getOfflineSnapshot<AdvisorOfflineBundle>({
    scope: args.scope,
    kind: DAY_KIND,
    entityId: args.day,
  });
  return stored?.data ?? null;
}

export async function getLatestCachedAdvisorDay(
  scope: OfflineMutationScope,
): Promise<AdvisorOfflineBundle | null> {
  const stored = await listOfflineSnapshots<AdvisorOfflineBundle>({
    scope,
    kind: DAY_KIND,
  });
  return (
    stored.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.data ??
    null
  );
}

export async function getCurrentAdvisorWorkOrderDraft(
  scope: OfflineMutationScope,
): Promise<AdvisorWorkOrderDraft | null> {
  const stored = await getOfflineSnapshot<AdvisorWorkOrderDraft>({
    scope,
    kind: DRAFT_KIND,
    entityId: CURRENT_DRAFT_ID,
  });
  return stored?.data ?? null;
}

export async function saveCurrentAdvisorWorkOrderDraft(
  draft: AdvisorWorkOrderDraft,
): Promise<void> {
  await saveOfflineSnapshot({
    scope: { userId: draft.userId, shopId: draft.shopId },
    kind: DRAFT_KIND,
    entityId: CURRENT_DRAFT_ID,
    data: draft,
    maxAgeMs: DRAFT_MAX_AGE_MS,
  });
}

export async function removeCurrentAdvisorWorkOrderDraft(
  scope: OfflineMutationScope,
): Promise<void> {
  await removeOfflineSnapshots({
    scope,
    kind: DRAFT_KIND,
    entityIds: [CURRENT_DRAFT_ID],
  });
}

export async function materializeAdvisorWorkOrderDraft(
  draft: AdvisorWorkOrderDraft,
): Promise<AdvisorDraftMaterialization> {
  const response = await fetch("/api/offline/advisor-work-order-drafts", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": draft.operationKey,
    },
    body: JSON.stringify(draft),
  });
  const body = (await response.json().catch(() => null)) as
    | AdvisorDraftMaterialization
    | { error?: string }
    | null;
  if (!response.ok || !body || !("workOrderId" in body)) {
    const error = new Error(
      (body && "error" in body && body.error) ||
        "Work-order draft could not be created.",
    ) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  await saveOfflineSnapshot({
    scope: { userId: draft.userId, shopId: draft.shopId },
    kind: MATERIALIZATION_KIND,
    entityId: draft.id,
    data: {
      draftId: draft.id,
      operationKey: draft.operationKey,
      ...body,
    },
    maxAgeMs: DRAFT_MAX_AGE_MS,
  });
  return body;
}
