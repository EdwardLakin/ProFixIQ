// features/inspections/lib/inspection/findings/page.tsx

"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";

import type {
  InspectionItem,
  InspectionItemStatus,
  InspectionSession,
  QuoteLineItem,
} from "@inspections/lib/inspection/types";

import PageShell from "@/features/shared/components/PageShell";
import { Button } from "@shared/components/ui/Button";
import StatusBadge from "@/features/shared/components/ui/StatusBadge";
import DecisionEventFeed from "@/features/shared/components/ui/DecisionEventFeed";
import { PANEL_VARIANTS } from "@/features/shared/components/ui/panelHierarchy";
import PhotoThumbnail from "@inspections/components/inspection/PhotoThumbnail";
import { formatDecisionStatus } from "@/features/shared/lib/decisionStatus";
import { deriveEventsFromFindings } from "@/features/shared/lib/decisionEvents";
import { requestQuoteSuggestion } from "@inspections/lib/inspection/aiQuote";
import { cn } from "@shared/lib/utils";
import { getPendingInspectionPhotoCount } from "@inspections/lib/inspection/inspectionPhotoStaging";
import {
  getInspectionOfflineDraft,
  removeInspectionOfflineDraft,
  saveInspectionOfflineDraft,
} from "@inspections/lib/inspection/offlineDrafts";
import { useInspectionAutosave } from "@inspections/hooks/useInspectionAutosave";

type FindingRow = {
  sectionIndex: number;
  itemIndex: number;
  sectionTitle: string;
  item: InspectionItem;
};

type DraftUiState = Record<
  string,
  {
    laborHoursText: string;
    partsText: string;
  }
>;

function norm(input: string | null | undefined): string {
  return String(input ?? "").trim().toLowerCase();
}

function findingKey(sectionIndex: number, itemIndex: number): string {
  return `${sectionIndex}:${itemIndex}`;
}

function inspectionDraftKey(args: {
  inspectionId: string;
  workOrderLineId?: string | null;
  workOrderId?: string | null;
  templateName?: string | null;
}) {
  const t = (args.templateName || "Inspection").toLowerCase().trim();
  if (args.workOrderLineId) {
    return `inspection-draft:line:${args.workOrderLineId}`;
  }
  if (args.workOrderId) {
    return `inspection-draft:wo:${args.workOrderId}:${t}`;
  }
  return `inspection-draft:template:${t}:${args.inspectionId}`;
}

function isFindingStatus(status: unknown): status is "fail" | "recommend" {
  const s = norm(String(status ?? ""));
  return s === "fail" || s === "recommend";
}

function summarizeFromSections(session: InspectionSession): {
  cause: string;
  correction: string;
} {
  const failed: string[] = [];
  const recommended: string[] = [];

  for (const sec of session.sections ?? []) {
    const sectionTitle = String(sec.title ?? "").trim();
    for (const item of sec.items ?? []) {
      const status = String(item.status ?? "").toLowerCase();
      if (status !== "fail" && status !== "recommend") continue;

      const label = String(item.item ?? item.name ?? "Item").trim();
      const note = String(item.notes ?? "").trim();
      const line = note
        ? `${sectionTitle ? `${sectionTitle}: ` : ""}${label} — ${note}`
        : `${sectionTitle ? `${sectionTitle}: ` : ""}${label}`;

      if (status === "fail") failed.push(line);
      if (status === "recommend") recommended.push(line);
    }
  }

  if (failed.length === 0 && recommended.length === 0) {
    return {
      cause: "Inspection completed.",
      correction:
        "Inspection completed. No failed or recommended items were recorded.",
    };
  }

  const parts: string[] = [];
  if (failed.length) parts.push(`Failed: ${failed.join("; ")}.`);
  if (recommended.length) parts.push(`Recommended: ${recommended.join("; ")}.`);

  return {
    cause: "Inspection found items requiring attention.",
    correction: parts.join(" "),
  };
}

function collectFindings(session: InspectionSession): FindingRow[] {
  const rows: FindingRow[] = [];
  for (let s = 0; s < session.sections.length; s += 1) {
    const sec = session.sections[s];
    for (let i = 0; i < (sec.items ?? []).length; i += 1) {
      const item = sec.items[i];
      if (!isFindingStatus(item.status)) continue;
      rows.push({
        sectionIndex: s,
        itemIndex: i,
        sectionTitle: String(sec.title ?? ""),
        item,
      });
    }
  }
  return rows;
}

function partsToText(parts: InspectionItem["parts"] | undefined): string {
  return (parts ?? []).map((p) => `${p.qty}x ${p.description}`).join("\n");
}

function parsePartsText(
  input: string,
): Array<{ description: string; qty: number }> {
  return input
    .split("\n")
    .map((line) => line.replace(/\r/g, ""))
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const trimmed = line.trim();
      const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*x?\s+(.+)$/i);

      if (match?.[1] && match?.[2]) {
        const qty = Number(match[1]);
        return {
          qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
          description: match[2].trim(),
        };
      }

      return {
        qty: 1,
        description: trimmed,
      };
    })
    .filter((p) => p.description.length > 0);
}

function laborHoursToText(value: number | null | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "";
  return String(value);
}

function sessionSyncRevision(session: InspectionSession | null): number {
  const value = session?.syncRevision;
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}

function updateQuoteLineInSession(
  session: InspectionSession,
  id: string,
  patch: Partial<QuoteLineItem>,
): InspectionSession {
  const current = Array.isArray(session.quote) ? session.quote : [];

  return {
    ...session,
    quote: current.map((line) => (line.id === id ? { ...line, ...patch } : line)),
  };
}

export default function InspectionFindingsPage(): JSX.Element {
  const router = useRouter();
  const sp = useSearchParams();

  const inspectionId = sp.get("inspectionId") || "";
  const workOrderId = sp.get("workOrderId") || "";
  const workOrderLineId = sp.get("workOrderLineId") || "";
  const templateName = sp.get("template") || "Inspection";

  const draftKey = useMemo(
    () =>
      inspectionDraftKey({
        inspectionId,
        workOrderId: workOrderId || null,
        workOrderLineId: workOrderLineId || null,
        templateName,
      }),
    [inspectionId, workOrderId, workOrderLineId, templateName],
  );

  const [session, setSession] = useState<InspectionSession | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const latestSessionRef = useRef<InspectionSession | null>(session);
  latestSessionRef.current = session;
  const activeDraftKeyRef = useRef(draftKey);
  activeDraftKeyRef.current = draftKey;
  const [isLocked, setIsLocked] = useState(false);
  const isLockedRef = useRef(isLocked);
  isLockedRef.current = isLocked;
  const [draftUi, setDraftUi] = useState<DraftUiState>({});
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const resolvedInspectionId =
    inspectionId ||
    (typeof session?.id === "string" ? session.id : "") ||
    "";

  const resolvedWorkOrderId =
    workOrderId ||
    (typeof session?.workOrderId === "string" ? session.workOrderId : "") ||
    "";

  const resolvedWorkOrderLineId =
    workOrderLineId ||
    (typeof (session as InspectionSession & { workOrderLineId?: string | null })
      ?.workOrderLineId === "string"
      ? ((session as InspectionSession & { workOrderLineId?: string | null })
          .workOrderLineId ?? "")
      : "") ||
    "";

  const {
    flush: flushAutosave,
    flushToServer: flushAutosaveToServer,
    label: autosaveLabel,
    lastError: autosaveError,
  } = useInspectionAutosave({
    session,
    inspectionId: resolvedInspectionId,
    workOrderLineId: resolvedWorkOrderLineId,
    enabled: Boolean(resolvedInspectionId || resolvedWorkOrderLineId),
    locked: isLocked,
    draftKey,
    onRemoteSession: (remote) => {
      latestSessionRef.current = remote;
      setSession(remote);
      void saveInspectionOfflineDraft({ draftKey, session: remote });
    },
    onRemoteMeta: (meta) => {
      isLockedRef.current = meta.locked;
      setIsLocked(meta.locked);
    },
  });

  const syncFromDraft = useCallback(async () => {
    if (isLockedRef.current || busyRef.current) return;
    const recovered = await getInspectionOfflineDraft({
      draftKey,
      sessionHint: {
        id: inspectionId,
        workOrderId: workOrderId || null,
        workOrderLineId: workOrderLineId || null,
        templateitem: templateName,
      },
    });
    if (recovered) {
      latestSessionRef.current = recovered.session;
      setSession(recovered.session);
    }
  }, [draftKey, inspectionId, templateName, workOrderId, workOrderLineId]);

  useEffect(() => {
    void syncFromDraft();
  }, [syncFromDraft]);

  const findings = useMemo(
    () => (session ? collectFindings(session) : []),
    [session],
  );
  const decisionEvents = useMemo(
    () =>
      deriveEventsFromFindings({
        findings: findings.map((row) => ({
          sectionTitle: row.sectionTitle,
          item: row.item,
        })),
        sessionLastUpdated: session?.lastUpdated ?? null,
        actorLabel: "Technician",
      }),
    [findings, session?.lastUpdated],
  );

  useEffect(() => {
    setDraftUi((prev) => {
      const nextUi: DraftUiState = { ...prev };

      for (const row of findings) {
        const key = findingKey(row.sectionIndex, row.itemIndex);
        nextUi[key] ??= {
          laborHoursText: laborHoursToText(row.item.laborHours),
          partsText: partsToText(row.item.parts),
        };
      }

      return nextUi;
    });
  }, [findings]);

  const updateFinding = (
    sectionIndex: number,
    itemIndex: number,
    patch: Partial<InspectionItem>,
  ): void => {
    if (isLockedRef.current || busyRef.current) return;
    setSession((prev) => {
      if (isLockedRef.current || busyRef.current || !prev) return prev;

      const next: InspectionSession = {
        ...prev,
        lastUpdated: new Date().toISOString(),
        sections: prev.sections.map((sec, sIdx) => {
          if (sIdx !== sectionIndex) return sec;
          return {
            ...sec,
            items: (sec.items ?? []).map((it, iIdx) =>
              iIdx === itemIndex ? { ...it, ...patch } : it,
            ),
          };
        }),
      };

      void saveInspectionOfflineDraft({ draftKey, session: next });
      latestSessionRef.current = next;

      return next;
    });
  };

  const updateUiDraft = (
    sectionIndex: number,
    itemIndex: number,
    patch: Partial<{ laborHoursText: string; partsText: string }>,
  ): void => {
    if (isLockedRef.current || busyRef.current) return;
    const key = findingKey(sectionIndex, itemIndex);
    setDraftUi((prev) =>
      isLockedRef.current || busyRef.current
        ? prev
        : ({
            ...prev,
      [key]: {
        laborHoursText: prev[key]?.laborHoursText ?? "",
        partsText: prev[key]?.partsText ?? "",
            ...patch,
          },
        }),
    );
  };

  const markReviewed = (row: FindingRow): void => {
    updateFinding(row.sectionIndex, row.itemIndex, {
      findingReviewed: true,
      photoReviewed:
        (row.item.photoUrls?.length ?? 0) > 0 ? true : row.item.photoReviewed,
    });
  };

  const handleUploadPhoto = async (
    row: FindingRow,
    file: File,
  ): Promise<void> => {
    if (busyRef.current) {
      toast.error("Wait for the current findings submission to finish.");
      return;
    }
    if (isLockedRef.current) {
      toast.error("This signed inspection is locked.");
      return;
    }
    if (!resolvedInspectionId) {
      toast.error("Missing inspection id.");
      return;
    }

    const key = findingKey(row.sectionIndex, row.itemIndex);
    const itemLabel = String(row.item.item ?? row.item.name ?? "Item");

    setUploadingKey(key);

    try {
      const form = new FormData();
      form.append("inspectionId", resolvedInspectionId);
      if (resolvedWorkOrderId) form.append("workOrderId", resolvedWorkOrderId);
      if (resolvedWorkOrderLineId) {
        form.append("workOrderLineId", resolvedWorkOrderLineId);
      }
      form.append("itemName", itemLabel);
      form.append("notes", String(row.item.notes ?? ""));
      form.append("file", file);

      const res = await fetch("/api/inspections/photos/upload", {
        method: "POST",
        body: form,
      });

      const json = (await res.json().catch(() => null)) as
        | { error?: string; url?: string | null }
        | null;

      if (!res.ok) {
        throw new Error(json?.error || "Failed to upload photo");
      }

      if (isLockedRef.current) {
        toast.error(
          "This inspection was signed while the photo was uploading; it was not attached.",
        );
        return;
      }

      const nextUrl = json?.url ?? null;
      const current = row.item.photoUrls ?? [];
      const nextPhotoUrls = nextUrl ? [...current, nextUrl] : current;

      updateFinding(row.sectionIndex, row.itemIndex, {
        photoUrls: nextPhotoUrls,
        photoRequested: false,
      });

      toast.success("Photo uploaded.");
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Failed to upload photo";
      toast.error(message);
    } finally {
      setUploadingKey(null);
      const input = fileInputRefs.current[key];
      if (input) input.value = "";
    }
  };

  const handleSubmitReviewed = async (): Promise<void> => {
    if (!session || isLockedRef.current || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const submissionDraftKey = draftKey;
    let submissionRevision = sessionSyncRevision(session);
    let submissionInspectionId = String(session.id ?? resolvedInspectionId);

    const assertSubmissionCurrent = (): void => {
      if (isLockedRef.current) {
        throw new Error(
          "This inspection was signed on another device while findings were being prepared.",
        );
      }
      if (activeDraftKeyRef.current !== submissionDraftKey) {
        throw new Error("The active inspection changed before submission finished.");
      }
      const latest = latestSessionRef.current;
      if (
        latest &&
        submissionInspectionId &&
        latest.id &&
        latest.id !== submissionInspectionId
      ) {
        throw new Error("The active inspection changed before submission finished.");
      }
      if (latest && sessionSyncRevision(latest) > submissionRevision) {
        throw new Error(
          "This inspection changed on another device. Review the latest changes and submit again.",
        );
      }
    };

    try {
      let pendingPhotoCount: number;
      try {
        pendingPhotoCount = await getPendingInspectionPhotoCount(draftKey);
      } catch {
        toast.error(
          "Unable to verify staged inspection photos. Open Sync Center and try again.",
        );
        return;
      }
      assertSubmissionCurrent();
      if (pendingPhotoCount > 0) {
        toast.error(
          `${pendingPhotoCount} inspection photo${pendingPhotoCount === 1 ? " is" : "s are"} still waiting to sync. Upload or remove them before submitting.`,
        );
        return;
      }

      if (!resolvedWorkOrderId) {
        toast.error("Missing work order id.");
        return;
      }

      if (!resolvedWorkOrderLineId) {
        toast.error("Missing work order line id.");
        return;
      }

      const durableSession = await flushAutosaveToServer(session);
      if (!durableSession) {
        throw new Error("Inspection did not finish saving to the server.");
      }
      latestSessionRef.current = durableSession;
      submissionRevision = sessionSyncRevision(durableSession);
      submissionInspectionId = String(
        durableSession.id ?? submissionInspectionId,
      );
      assertSubmissionCurrent();

      const submissionFindings = collectFindings(durableSession);
      const pending = submissionFindings.filter(
        (row) => row.item.findingReviewed !== true,
      );

      if (pending.length > 0) {
        toast.error("Review every finding before submitting.");
        return;
      }

      const actionable = submissionFindings.filter((row) => {
        const item = row.item as InspectionItem & {
          estimateSubmitted?: boolean;
          estimateQuoteLineId?: string | null;
        };
        const status = String(item.status ?? "").toLowerCase();
        const note = String(item.notes ?? "").trim();
        return (
          (status === "fail" || status === "recommend") && note.length > 0
        );
      });

      // A clean inspection has no quote findings, but still needs a durable
      // finalization path. Only block when findings exist but are incomplete.
      if (submissionFindings.length > 0 && actionable.length === 0) {
        toast.error("No reviewed findings are ready to submit.");
        return;
      }

      let nextSession: InspectionSession = { ...durableSession };
      const nowIso = new Date().toISOString();
      const quotePayloadItems: Array<{
        id: string;
        description: string;
        title: string;
        jobType: "repair";
        status: "pending_parts" | "advisor_pending";
        stage: "advisor_pending";
        source: "inspection";
        sourceInspectionId: string | null;
        sourceWorkOrderLineId: string | null;
        sourceSectionKey: string;
        sourceSectionTitle: string;
        sourceItemKey: string;
        sourceFindingTitle: string;
        normalizedFindingTitle: string;
        findingIdentity: string;
        notes: string | null;
        complaint: string | null;
        aiComplaint: string | null;
        aiCause: string | null;
        aiCorrection: string | null;
        estLaborHours: number | null;
        laborHours: number | null;
        laborRate: number | null;
        partsTotal: number;
        laborTotal: number | null;
        subtotal: number;
        grandTotal: number;
        photoUrls: string[];
        parts: Array<{
          description: string;
          name: string;
          qty: number;
          cost?: number | null;
        }>;
        metadata: Record<string, unknown>;
      }> = [];
      const quoteIdByFindingKey = new Map<string, string>();

      for (const row of findings) {
        const item = row.item;
        const status = String(item.status ?? "").toLowerCase();

        if (status !== "fail" && status !== "recommend") continue;

        const desc = String(item.item ?? item.name ?? "Item").trim();
        const note = String(item.notes ?? "").trim();

        if (!desc || !note) continue;

        const itemExt = item as InspectionItem & {
          estimateSubmitted?: boolean;
          estimateSubmittedAt?: string | null;
          estimateLastUpdatedAt?: string | null;
          estimateWorkOrderLineId?: string | null;
          estimateQuoteLineId?: string | null;
          laborHours?: number | null;
          parts?: { description: string; qty: number }[];
          value?: string | number | null;
          smartMatch?: {
            sourceType?: "history_repair" | "catalog_menu" | null;
            label?: string | null;
            menuItemId?: string | null;
            menuRepairItemId?: string | null;
            laborHours?: number | null;
            parts?: Array<{ name: string; qty?: number }>;
            pricingStatus?: string | null;
            pricingValidUntil?: string | null;
            confidence?: number | null;
          } | null;
          noPartsRequired?: boolean;
        };

        const manualParts = Array.isArray(itemExt.parts) ? itemExt.parts : [];
        const manualLaborHours =
          typeof itemExt.laborHours === "number" ? itemExt.laborHours : null;

        const existingQuoteId =
          typeof itemExt.estimateQuoteLineId === "string" &&
          itemExt.estimateQuoteLineId.trim().length > 0
            ? itemExt.estimateQuoteLineId.trim()
            : null;

        if (itemExt.estimateSubmitted === true && existingQuoteId) {
          continue;
        }

        const quoteId = existingQuoteId ?? uuidv4();
        const sourceSectionKey = String(row.sectionIndex);
        const sourceItemKey = String(row.itemIndex);
        const normalizedFindingTitle = norm(desc).replace(/\s+/g, " ");
        const findingIdentity = [
          resolvedInspectionId || "inspection-draft",
          resolvedWorkOrderLineId || "inspection-line",
          sourceSectionKey,
          sourceItemKey,
          normalizedFindingTitle,
        ].join(":");

        const quoteAlreadyExists = (nextSession.quote ?? []).some(
          (line) => line.id === quoteId,
        );

        const acceptedMatch = itemExt.smartMatch ?? null;
        const acceptedMenuParts = Array.isArray(acceptedMatch?.parts)
          ? acceptedMatch.parts
              .map((part) => ({
                name: String(part.name ?? "").trim(),
                qty:
                  typeof part.qty === "number" && Number.isFinite(part.qty) && part.qty > 0
                    ? part.qty
                    : 1,
              }))
              .filter((part) => part.name.length > 0)
          : [];
        const acceptedMenuLaborHours =
          typeof acceptedMatch?.laborHours === "number" &&
          Number.isFinite(acceptedMatch.laborHours)
            ? acceptedMatch.laborHours
            : null;

        if (!existingQuoteId && !quoteAlreadyExists) {
          const placeholder: QuoteLineItem = {
            id: quoteId,
            description: desc,
            item: desc,
            name: desc,
            status: status as "fail" | "recommend",
            notes: note,
            price: 0,
            laborTime: 0.5,
            laborRate: 0,
            editable: true,
            source: "inspection",
            value: itemExt.value,
            photoUrls: item.photoUrls ?? [],
            aiState: "loading",
          };

          nextSession = {
            ...nextSession,
            quote: [...(nextSession.quote ?? []), placeholder],
          };
        } else {
          nextSession = updateQuoteLineInSession(nextSession, quoteId, {
            aiState: "loading",
          });
        }

        const suggestion = await requestQuoteSuggestion({
          item: desc,
          notes: note,
          section: row.sectionTitle,
          status,
          vehicle: nextSession.vehicle ?? undefined,
        });
        assertSubmissionCurrent();

        const noPartsRequired = itemExt.noPartsRequired === true;
        const verifiedParts: Array<{ name: string; qty: number }> =
          noPartsRequired
            ? []
            : manualParts.length > 0
            ? manualParts.map((part) => ({
                name: part.description,
                qty: part.qty,
              }))
            : acceptedMenuParts;

        const laborHours =
          manualLaborHours != null && !Number.isNaN(manualLaborHours)
            ? manualLaborHours
            : acceptedMenuLaborHours != null
              ? acceptedMenuLaborHours
              : null;

        const laborRate = null;

        const partsTotal = 0;
        const laborTotal = null;
        const price = partsTotal;

        nextSession = updateQuoteLineInSession(nextSession, quoteId, {
          price,
          laborTime: laborHours ?? 0,
          laborRate: 0,
          ai: suggestion
            ? {
                summary: suggestion.summary,
                confidence: suggestion.confidence,
                parts: verifiedParts,
              }
            : {
                summary: "AI enrichment unavailable; deterministic inspection finding submitted.",
                confidence: "low",
                parts: verifiedParts,
              },
          aiState: suggestion ? "done" : "error",
        });

        quotePayloadItems.push({
          id: quoteId,
          description: desc,
          title: desc,
          jobType: "repair",
          status: verifiedParts.length > 0 ? "pending_parts" : "advisor_pending",
          stage: "advisor_pending",
          source: "inspection",
          sourceInspectionId: resolvedInspectionId || null,
          sourceWorkOrderLineId: resolvedWorkOrderLineId || null,
          sourceSectionKey,
          sourceSectionTitle: row.sectionTitle,
          sourceItemKey,
          sourceFindingTitle: desc,
          normalizedFindingTitle,
          findingIdentity,
          notes: note || null,
          complaint: note || null,
          aiComplaint: note || null,
          aiCause: suggestion?.summary ?? null,
          aiCorrection: suggestion?.summary ?? null,
          estLaborHours: laborHours,
          laborHours,
          laborRate,
          partsTotal,
          laborTotal,
          subtotal: price,
          grandTotal: price,
          photoUrls: item.photoUrls ?? [],
          parts: verifiedParts.map((part) => ({
            description: part.name,
            name: part.name,
            qty: part.qty,
            cost: null,
          })),
          metadata: {
            inspection_status: status,
            technician_notes: note,
            manual_parts: manualParts,
            no_parts_required: noPartsRequired,
            source_value: itemExt.value ?? null,
            ai_enrichment_state: suggestion ? "available" : "unavailable",
            menu_match: acceptedMatch
              ? {
                  source_type: acceptedMatch.sourceType ?? null,
                  label: acceptedMatch.label ?? null,
                  menu_item_id: acceptedMatch.menuItemId ?? null,
                  menu_repair_item_id: acceptedMatch.menuRepairItemId ?? null,
                  pricing_status: acceptedMatch.pricingStatus ?? null,
                  pricing_valid_until: acceptedMatch.pricingValidUntil ?? null,
                  pricing_review_required: acceptedMatch.pricingStatus !== "fresh",
                  technician_pricing_approved: false,
                  confidence: acceptedMatch.confidence ?? null,
                }
              : null,
          },
        });
        quoteIdByFindingKey.set(findingKey(row.sectionIndex, row.itemIndex), quoteId);
      }

      if (quotePayloadItems.length > 0) {
        assertSubmissionCurrent();
        const quoteRes = await fetch("/api/work-orders/quotes/add", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workOrderId: resolvedWorkOrderId,
            vehicleId:
              typeof (nextSession.vehicle as unknown as { id?: unknown } | null | undefined)
                ?.id === "string"
                ? (nextSession.vehicle as unknown as { id: string }).id
                : null,
            items: quotePayloadItems,
        