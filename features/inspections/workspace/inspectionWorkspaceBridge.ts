"use client";

export type InspectionWorkspaceItemSnapshot = {
  item?: string | null;
  name?: string | null;
  status?: unknown;
  notes?: string | null;
  note?: string | null;
  estimateSubmitted?: boolean;
};

export type InspectionWorkspaceSectionSnapshot = {
  title?: string | null;
  items?: InspectionWorkspaceItemSnapshot[] | null;
};

export type InspectionWorkspaceSessionSnapshot = {
  id?: string | null;
  workOrderLineId?: string | null;
  templateitem?: string | null;
  templateName?: string | null;
  currentSectionIndex?: number | null;
  sections?: InspectionWorkspaceSectionSnapshot[] | null;
  voiceMeta?: {
    linesAddedToWorkOrder?: number | null;
  } | null;
};

export type InspectionWorkspaceTarget = {
  inspectionId?: string | null;
  workOrderLineId?: string | null;
};

export type InspectionWorkspaceSectionRequest = InspectionWorkspaceTarget & {
  sectionIndex: number;
};

const STATE_EVENT = "profixiq:inspection-workspace-state";
const SELECT_SECTION_EVENT = "profixiq:inspection-workspace-select-section";

const latestByInspectionId = new Map<string, InspectionWorkspaceSessionSnapshot>();
const latestByWorkOrderLineId = new Map<string, InspectionWorkspaceSessionSnapshot>();

function remember(snapshot: InspectionWorkspaceSessionSnapshot): void {
  const inspectionId = String(snapshot.id ?? "").trim();
  const workOrderLineId = String(snapshot.workOrderLineId ?? "").trim();

  if (inspectionId) latestByInspectionId.set(inspectionId, snapshot);
  if (workOrderLineId) latestByWorkOrderLineId.set(workOrderLineId, snapshot);
}

export function publishInspectionWorkspaceState(
  snapshot: InspectionWorkspaceSessionSnapshot,
): void {
  remember(snapshot);
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent<InspectionWorkspaceSessionSnapshot>(STATE_EVENT, {
      detail: snapshot,
    }),
  );
}

export function getLatestInspectionWorkspaceState(
  target: InspectionWorkspaceTarget,
): InspectionWorkspaceSessionSnapshot | null {
  const workOrderLineId = String(target.workOrderLineId ?? "").trim();
  if (workOrderLineId) {
    const byLine = latestByWorkOrderLineId.get(workOrderLineId);
    if (byLine) return byLine;
  }

  const inspectionId = String(target.inspectionId ?? "").trim();
  if (inspectionId) {
    const byInspection = latestByInspectionId.get(inspectionId);
    if (byInspection) return byInspection;
  }

  return null;
}

export function subscribeInspectionWorkspaceState(
  listener: (snapshot: InspectionWorkspaceSessionSnapshot) => void,
): () => void {
  if (typeof window === "undefined") return () => undefined;

  const handler = (event: Event) => {
    const detail = (event as CustomEvent<InspectionWorkspaceSessionSnapshot>).detail;
    if (detail) listener(detail);
  };

  window.addEventListener(STATE_EVENT, handler);
  return () => window.removeEventListener(STATE_EVENT, handler);
}

export function requestInspectionWorkspaceSection(
  request: InspectionWorkspaceSectionRequest,
): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<InspectionWorkspaceSectionRequest>(SELECT_SECTION_EVENT, {
      detail: request,
    }),
  );
}

export function subscribeInspectionWorkspaceSectionRequests(
  listener: (request: InspectionWorkspaceSectionRequest) => void,
): () => void {
  if (typeof window === "undefined") return () => undefined;

  const handler = (event: Event) => {
    const detail = (event as CustomEvent<InspectionWorkspaceSectionRequest>).detail;
    if (detail) listener(detail);
  };

  window.addEventListener(SELECT_SECTION_EVENT, handler);
  return () => window.removeEventListener(SELECT_SECTION_EVENT, handler);
}
