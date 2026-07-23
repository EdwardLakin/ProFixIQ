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
          }),
        });

        const quoteJson = (await quoteRes.json().catch(() => null)) as
          | {
              error?: string;
              items?: Array<{
                requestedId?: string | null;
                id: string;
                created: boolean;
              }>;
            }
          | null;
        assertSubmissionCurrent();

        if (!quoteRes.ok) {
          throw new Error(quoteJson?.error || "Failed to send findings to quote review");
        }

        const canonicalQuoteIds = new Map<string, string>();
        for (const result of quoteJson?.items ?? []) {
          if (result.requestedId) canonicalQuoteIds.set(result.requestedId, result.id);
        }

        nextSession = {
          ...nextSession,
          sections: nextSession.sections.map((sec, sIdx) => ({
            ...sec,
            items: (sec.items ?? []).map((it, iIdx) => {
              const localQuoteId = quoteIdByFindingKey.get(findingKey(sIdx, iIdx));
              if (!localQuoteId) return it;
              return {
                ...it,
                estimateSubmitted: true,
                estimateSubmittedAt:
                  (it as InspectionItem & { estimateSubmittedAt?: string | null })
                    .estimateSubmittedAt ?? nowIso,
                estimateLastUpdatedAt: nowIso,
                estimateWorkOrderLineId: null,
                estimateQuoteLineId:
                  canonicalQuoteIds.get(localQuoteId) ?? localQuoteId,
              };
            }),
          })),
        };
      }

      assertSubmissionCurrent();
      nextSession = { ...nextSession, lastUpdated: nowIso };
      latestSessionRef.current = nextSession;
      setSession(nextSession);
      await saveInspectionOfflineDraft({ draftKey, session: nextSession });
      const persistedSession = await flushAutosaveToServer(nextSession);
      if (!persistedSession) {
        throw new Error("Inspection did not finish saving to the server.");
      }
      nextSession = persistedSession;
      latestSessionRef.current = persistedSession;
      submissionRevision = sessionSyncRevision(persistedSession);
      submissionInspectionId = String(
        persistedSession.id ?? submissionInspectionId,
      );
      assertSubmissionCurrent();

      const payload = summarizeFromSections(nextSession);

      assertSubmissionCurrent();
      const pdfRes = await fetch(`/api/inspections/finalize/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workOrderLineId: resolvedWorkOrderLineId,
          expectedSyncRevision: nextSession.syncRevision ?? 0,
        }),
      });

      const pdfJson = (await pdfRes.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

      if (!pdfRes.ok || !pdfJson?.ok) {
        throw new Error(
          pdfJson?.error ||
            "Inspection could not be finalized. Your draft is still saved.",
        );
      }

      await removeInspectionOfflineDraft({
        draftKey,
        session: nextSession,
      });

      window.dispatchEvent(
        new CustomEvent("inspection:completed", {
          detail: {
            workOrderLineId: resolvedWorkOrderLineId,
            cause: payload.cause,
            correction: payload.correction,
            reviewSubmitted: true,
          },
        }),
      );

      window.dispatchEvent(new CustomEvent("inspection:close"));
      toast.success("Findings sent to quote review.");
      router.push(`/quote-review/${resolvedWorkOrderId}`);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Unable to submit findings";
      toast.error(message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  if (!session) {
    return (
      <PageShell
        title="Inspection findings"
        description="Review findings before submission."
      >
        <div className={cn(PANEL_VARIANTS.secondary, "p-4 text-sm text-[color:var(--theme-text-secondary)]")}>
          Loading findings…
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Inspection findings"
      description="Review failed and recommended findings before sending them to advisor quote review."
    >
      <div className="mx-auto max-w-5xl space-y-4">
        {isLocked && (
          <div className="rounded-xl border border-amber-500/60 bg-amber-500/10 p-3 text-sm text-amber-100">
            This inspection is signed and locked. Reopen it before changing findings.
          </div>
        )}
        <DecisionEventFeed events={decisionEvents} compact maxVisible={5} />
        {findings.length === 0 ? (
          <div className={cn(PANEL_VARIANTS.passive, "p-4 text-sm text-[color:var(--theme-text-secondary)]")}>
            No failed or recommended findings to review.
          </div>
        ) : (
          findings.map((row) => {
            const key = findingKey(row.sectionIndex, row.itemIndex);
            const itemLabel = String(row.item.item ?? row.item.name ?? "Item");
            const status = String(
              row.item.status ?? "",
            ).toLowerCase() as InspectionItemStatus;
            const photos = row.item.photoUrls ?? [];
            const reviewed = row.item.findingReviewed === true;
            const decisionStatus = formatDecisionStatus({
              findingStatus: status,
              hasEvidence: photos.length > 0,
              isReviewed: reviewed,
            });
            const laborHoursText = draftUi[key]?.laborHoursText ?? "";
            const partsText = draftUi[key]?.partsText ?? "";
            const isUploading = uploadingKey === key;

            return (
              <div
                key={key}
                className={cn(PANEL_VARIANTS.primary, "p-4")}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
                      Decision unit • {row.sectionTitle}
                    </div>
                    <div className="text-lg font-semibold text-[color:var(--theme-text-primary)]">
                      {itemLabel}
                    </div>
                  </div>
                  <StatusBadge
                    variant={decisionStatus.variant}
                    className="px-3 py-1 text-[10px]"
                  >
                    {decisionStatus.label}
                  </StatusBadge>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                  <div className={cn(PANEL_VARIANTS.secondary, "space-y-3 p-3")}>
                    <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
                      Evidence
                    </div>
                    <label className="space-y-1">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
                        Technician notes
                      </div>
                      <textarea
                        className="min-h-[110px] w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 text-sm text-[color:var(--theme-text-primary)] outline-none"
                        value={String(row.item.notes ?? "")}
                        disabled={isLocked || busy}
                        onChange={(e) =>
                          updateFinding(row.sectionIndex, row.itemIndex, {
                            notes: e.target.value,
                          })
                        }
                      />
                    </label>
                    <div>
                      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-[color:var(--theme-text-secondary)]">
                        <span className="rounded-full border border-[color:var(--theme-border-soft)] px-3 py-1">
                          Visual proof: {photos.length} photo{photos.length === 1 ? "" : "s"}
                        </span>

                        <input
                          ref={(el) => {
                            fileInputRefs.current[key] = el;
                          }}
                          type="file"
                          accept="image/*"
                          disabled={isLocked || busy}
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            void handleUploadPhoto(row, file);
                          }}
                        />

                        <button
                          type="button"
                          className="rounded-full border border-[color:var(--theme-border-soft)] px-3 py-1 hover:bg-[color:var(--theme-surface-subtle)] disabled:opacity-60"
                          onClick={() => fileInputRefs.current[key]?.click()}
                          disabled={isUploading || isLocked || busy}
                        >
                          {isUploading ? "Uploading photo..." : "Add photo evidence"}
                        </button>
                      </div>
                      {photos.length > 0 ? (
                        <div className="flex gap-2 overflow-x-auto pb-1">
                          {photos.map((url, i) => (
                            <PhotoThumbnail key={`${url}-${i}`} url={url} />
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 text-xs text-[color:var(--theme-text-muted)]">
                          Add at least one photo for stronger customer approval confidence.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className={cn(PANEL_VARIANTS.passive, "space-y-3 p-3")}>
                    <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--theme-text-secondary)]">
                      Recommendation
                    </div>
                    <label className="space-y-1">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
                        Labor hours
                      </div>
                      <input
                        type="text"
                        inputMode="decimal"
                        className="w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 text-sm text-[color:var(--theme-text-primary)] outline-none"
                        value={laborHoursText}
                        disabled={isLocked || busy}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (/^\d*\.?\d*$/.test(raw)) {
                            updateUiDraft(row.sectionIndex, row.itemIndex, {
                              laborHoursText: raw,
                            });
                          }
                        }}
                        onBlur={() => {
                          const raw = laborHoursText.trim();

                          if (raw === "") {
                            updateUiDraft(row.sectionIndex, row.itemIndex, {
                              laborHoursText: "",
                            });
                            updateFinding(row.sectionIndex, row.itemIndex, {
                              laborHours: null,
                            });
                            return;
                          }

                          const parsed = Number(raw);
                          if (!Number.isFinite(parsed)) {
                            updateUiDraft(row.sectionIndex, row.itemIndex, {
                              laborHoursText: laborHoursToText(
                                row.item.laborHours,
                              ),
                            });
                            return;
                          }

                          updateUiDraft(row.sectionIndex, row.itemIndex, {
                            laborHoursText: String(parsed),
                          });
                          updateFinding(row.sectionIndex, row.itemIndex, {
                            laborHours: parsed,
                          });
                        }}
                      />
                    </label>

                    <label className="space-y-1">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--theme-text-muted)]">
                        Parts and quantities
                      </div>
                      <textarea
                        className="min-h-[110px] w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 text-sm text-[color:var(--theme-text-primary)] outline-none"
                        value={partsText}
                        disabled={isLocked || busy}
                        onChange={(e) => {
                          updateUiDraft(row.sectionIndex, row.itemIndex, {
                            partsText: e.target.value,
                          });
                        }}
                        onBlur={() => {
                          updateFinding(row.sectionIndex, row.itemIndex, {
                            parts: parsePartsText(partsText),
                          });
                        }}
                      />
                    </label>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-[color:var(--theme-text-secondary)]">
                  <button
                    type="button"
                    className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-emerald-200 hover:bg-emerald-500/20"
                    disabled={isLocked || busy}
                    onClick={() => markReviewed(row)}
                  >
                    {reviewed ? "Reviewed" : "Mark reviewed"}
                  </button>

                  <button
                    type="button"
                    className="rounded-full border border-[color:var(--theme-border-soft)] px-3 py-1 hover:bg-[color:var(--theme-surface-subtle)]"
                    disabled={isLocked || busy}
                    onClick={() =>
                      updateFinding(row.sectionIndex, row.itemIndex, {
                        photoRequested: true,
                      })
                    }
                  >
                    Mark photo requested
                  </button>

                  <button
                    type="button"
                    className="rounded-full border border-[color:var(--theme-border-soft)] px-3 py-1 hover:bg-[color:var(--theme-surface-subtle)]"
                    disabled={isLocked || busy}
                    onClick={() =>
                      updateFinding(row.sectionIndex, row.itemIndex, {
                        photoReviewed: true,
                      })
                    }
                  >
                    Mark photo reviewed
                  </button>
                </div>
                <div className="mt-2 text-[11px] text-[color:var(--theme-text-muted)]">
                  Action needed: mark reviewed so this recommendation can move to quote review.
                </div>
              </div>
            );
          })
        )}

        <div className={cn(PANEL_VARIANTS.secondary, "flex flex-wrap items-center justify-between gap-3 p-4")}>
          <div className="text-sm text-[color:var(--theme-text-secondary)]">
            <div>
              Reviewed findings:{" "}
            <span className="font-semibold text-[color:var(--theme-text-primary)]">
              {
                findings.filter((row) => row.item.findingReviewed === true)
                  .length
              }
            </span>
            {" / "}
            <span className="font-semibold text-[color:var(--theme-text-primary)]">{findings.length}</span>
            </div>
            <div className="mt-1 text-xs">
              {autosaveLabel}
              {autosaveError && (
                <span className="ml-2 text-red-400">{autosaveError}</span>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={async () => {
                try {
                  await flushAutosave();
                  router.back();
                } catch (error) {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Wait for the inspection to finish saving.",
                  );
                }
              }}
            >
              Back
            </Button>
            <Button
              type="button"
              onClick={handleSubmitReviewed}
              isLoading={busy}
              disabled={isLocked || busy}
            >
              {busy ? "Sending…" : "Send to Quote Review"}
            </Button>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
