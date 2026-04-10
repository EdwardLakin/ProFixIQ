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
  VoiceMeta,
} from "@inspections/lib/inspection/types";

import PageShell from "@/features/shared/components/PageShell";
import { Button } from "@shared/components/ui/Button";
import StatusBadge from "@/features/shared/components/ui/StatusBadge";
import { PANEL_VARIANTS } from "@/features/shared/components/ui/panelHierarchy";
import PhotoThumbnail from "@inspections/components/inspection/PhotoThumbnail";
import { requestQuoteSuggestion } from "@inspections/lib/inspection/aiQuote";
import { addWorkOrderLineFromSuggestion } from "@inspections/lib/inspection/addWorkOrderLine";
import { cn } from "@shared/lib/utils";

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

function readDraftSession(key: string): InspectionSession | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as InspectionSession;
  } catch {
    return null;
  }
}

function writeDraftSession(key: string, session: InspectionSession): void {
  try {
    if (typeof window === "undefined") return;
    localStorage.setItem(key, JSON.stringify(session));
  } catch {
    // ignore
  }
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

  const syncFromDraft = useCallback(async () => {
    const loaded = readDraftSession(draftKey);

    const loadedWorkOrderId =
      loaded && typeof loaded.workOrderId === "string"
        ? loaded.workOrderId.trim()
        : "";

    const loadedWorkOrderLineId =
      loaded &&
      typeof (loaded as InspectionSession & { workOrderLineId?: string | null })
        .workOrderLineId === "string"
        ? String(
            (loaded as InspectionSession & { workOrderLineId?: string | null })
              .workOrderLineId ?? "",
          ).trim()
        : "";

    if (loaded) {
      setSession(loaded);
    }

    const needsBackfill =
      !loaded || !loadedWorkOrderId || !loadedWorkOrderLineId;

    if (!needsBackfill) {
      return;
    }

    if (!inspectionId && !workOrderLineId && !resolvedWorkOrderLineId) {
      return;
    }

    try {
      const params = new URLSearchParams();
      if (inspectionId) params.set("inspectionId", inspectionId);
      if (resolvedWorkOrderLineId) {
        params.set("workOrderLineId", resolvedWorkOrderLineId);
      }

      const res = await fetch(`/api/inspections/load?${params.toString()}`, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });

      const data = (await res.json().catch(() => null)) as
        | { session?: InspectionSession | null }
        | null;

      const serverSession = data?.session ?? null;
      if (serverSession) {
        const mergedSession = {
          ...(loaded ?? {}),
          ...serverSession,
          workOrderId:
            (typeof serverSession.workOrderId === "string" &&
            serverSession.workOrderId.trim().length > 0
              ? serverSession.workOrderId.trim()
              : "") ||
            loadedWorkOrderId ||
            workOrderId ||
            resolvedWorkOrderId ||
            null,
          workOrderLineId:
            ((typeof (
              serverSession as InspectionSession & {
                workOrderLineId?: string | null;
              }
            ).workOrderLineId === "string" &&
            String(
              (
                serverSession as InspectionSession & {
                  workOrderLineId?: string | null;
                }
              ).workOrderLineId ?? "",
            ).trim().length > 0
              ? String(
                  (
                    serverSession as InspectionSession & {
                      workOrderLineId?: string | null;
                    }
                  ).workOrderLineId ?? "",
                ).trim()
              : "") ||
              loadedWorkOrderLineId ||
              workOrderLineId ||
              resolvedWorkOrderLineId ||
              null),
        } as InspectionSession;

        writeDraftSession(draftKey, mergedSession);
        setSession(mergedSession);
      }
    } catch (err) {
      console.error("[inspection-findings] failed to load saved session", err);
    }
  }, [
    draftKey,
    inspectionId,
    workOrderId,
    workOrderLineId,
    resolvedWorkOrderId,
    resolvedWorkOrderLineId,
  ]);

  useEffect(() => {
    void syncFromDraft();
  }, [syncFromDraft]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleFocus = () => {
      void syncFromDraft();
    };
    const handlePageShow = () => {
      void syncFromDraft();
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === draftKey) void syncFromDraft();
    };

    const handleInspectionDraftUpdated = (e: Event) => {
      const custom = e as CustomEvent<{ draftKey?: string }>;
      if (!custom.detail?.draftKey || custom.detail.draftKey === draftKey) {
        void syncFromDraft();
      }
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("storage", handleStorage);
    window.addEventListener(
      "inspection:draft-updated",
      handleInspectionDraftUpdated as EventListener,
    );

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(
        "inspection:draft-updated",
        handleInspectionDraftUpdated as EventListener,
      );
    };
  }, [draftKey, syncFromDraft]);

  const findings = useMemo(
    () => (session ? collectFindings(session) : []),
    [session],
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
    setSession((prev) => {
      if (!prev) return prev;

      const next: InspectionSession = {
        ...prev,
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

      writeDraftSession(draftKey, next);

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("inspection:draft-updated", {
            detail: { draftKey },
          }),
        );
      }

      return next;
    });
  };

  const updateUiDraft = (
    sectionIndex: number,
    itemIndex: number,
    patch: Partial<{ laborHoursText: string; partsText: string }>,
  ): void => {
    const key = findingKey(sectionIndex, itemIndex);
    setDraftUi((prev) => ({
      ...prev,
      [key]: {
        laborHoursText: prev[key]?.laborHoursText ?? "",
        partsText: prev[key]?.partsText ?? "",
        ...patch,
      },
    }));
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
    if (!session) return;

    if (!resolvedWorkOrderId) {
      toast.error("Missing work order id.");
      return;
    }

    if (!resolvedWorkOrderLineId) {
      toast.error("Missing work order line id.");
      return;
    }

    const pending = collectFindings(session).filter(
      (row) => row.item.findingReviewed !== true,
    );

    if (pending.length > 0) {
      toast.error("Review every finding before submitting.");
      return;
    }

    const actionable = findings.filter((row) => {
      const item = row.item as InspectionItem & {
        estimateSubmitted?: boolean;
        estimateWorkOrderLineId?: string | null;
      };

      const status = String(item.status ?? "").toLowerCase();
      if (status !== "fail" && status !== "recommend") return false;

      const note = String(item.notes ?? "").trim();
      if (!note) return false;

      if (
        item.estimateSubmitted === true &&
        typeof item.estimateWorkOrderLineId === "string" &&
        item.estimateWorkOrderLineId.trim().length > 0
      ) {
        return true;
      }

      return true;
    });

    if (actionable.length === 0) {
      toast.error("No reviewed findings are ready to submit.");
      return;
    }

    setBusy(true);

    try {
      let nextSession: InspectionSession = { ...session };

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
        };

        const manualParts = Array.isArray(itemExt.parts) ? itemExt.parts : [];
        const manualLaborHours =
          typeof itemExt.laborHours === "number" ? itemExt.laborHours : null;

        const existingLineId =
          typeof itemExt.estimateWorkOrderLineId === "string" &&
          itemExt.estimateWorkOrderLineId.trim().length > 0
            ? itemExt.estimateWorkOrderLineId.trim()
            : null;

        const existingQuoteId =
          typeof itemExt.estimateQuoteLineId === "string" &&
          itemExt.estimateQuoteLineId.trim().length > 0
            ? itemExt.estimateQuoteLineId.trim()
            : null;

        const alreadySubmitted = itemExt.estimateSubmitted === true;

        if (alreadySubmitted && !existingLineId) {
          continue;
        }

        const quoteId = existingQuoteId ?? uuidv4();
        const nowIso = new Date().toISOString();

        const quoteAlreadyExists = (nextSession.quote ?? []).some(
          (line) => line.id === quoteId,
        );

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

        if (!suggestion) {
          nextSession = updateQuoteLineInSession(nextSession, quoteId, {
            aiState: "error",
          });
          continue;
        }

        const mergedParts: Array<{ name: string; qty: number; cost?: number }> = [
          ...((suggestion.parts ?? []) as Array<{
            name: string;
            qty: number;
            cost?: number;
          }>),
          ...manualParts.map((p) => ({ name: p.description, qty: p.qty })),
        ];

        const laborTime =
          manualLaborHours != null && !Number.isNaN(manualLaborHours)
            ? manualLaborHours
            : (suggestion.laborHours ?? 0.5);

        const laborRate = suggestion.laborRate ?? 0;

        const partsTotal =
          mergedParts.reduce(
            (sum, p) => sum + (typeof p.cost === "number" ? p.cost : 0),
            0,
          ) ?? 0;

        const price = Math.max(0, partsTotal + laborRate * laborTime);

        nextSession = updateQuoteLineInSession(nextSession, quoteId, {
          price,
          laborTime,
          laborRate,
          ai: {
            summary: suggestion.summary,
            confidence: suggestion.confidence,
            parts: mergedParts,
          },
          aiState: "done",
        });

        const cleanParts = manualParts
          .map((p) => ({
            description: String(p.description ?? "").trim(),
            qty: Number(p.qty ?? 0),
          }))
          .filter((p) => p.description.length > 0 && p.qty > 0);

        if (existingLineId) {
          const updateRes = await fetch(
            "/api/work-orders/lines/update-from-inspection",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                workOrderId: resolvedWorkOrderId,
                workOrderLineId: existingLineId,
                laborHours: laborTime,
                complaint: note || null,
                notes: note || null,
                aiSummary: suggestion.summary ?? null,
              }),
            },
          );

          if (!updateRes.ok) {
            const body = (await updateRes.json().catch(() => null)) as unknown;
            console.error("Update WO line error", body);
            throw new Error("Could not update existing estimate line");
          }

          if (cleanParts.length > 0) {
            const res = await fetch("/api/parts/requests/create", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                workOrderId: resolvedWorkOrderId,
                jobId: existingLineId,
                notes: note || null,
                items: cleanParts,
              }),
            });

            if (!res.ok) {
              const body = (await res.json().catch(() => null)) as unknown;
              console.error("Parts request error", body);
              throw new Error("Estimate updated, but parts request failed");
            }
          }

          nextSession = {
            ...nextSession,
            sections: nextSession.sections.map((sec, sIdx) => {
              if (sIdx !== row.sectionIndex) return sec;
              return {
                ...sec,
                items: (sec.items ?? []).map((it, iIdx) =>
                  iIdx === row.itemIndex
                    ? {
                        ...it,
                        estimateSubmitted: true,
                        estimateSubmittedAt:
                          itemExt.estimateSubmittedAt ?? nowIso,
                        estimateLastUpdatedAt: nowIso,
                        estimateWorkOrderLineId: existingLineId,
                        estimateQuoteLineId: quoteId,
                      }
                    : it,
                ),
              };
            }),
          };

          continue;
        }

        const created = await addWorkOrderLineFromSuggestion({
          workOrderId: resolvedWorkOrderId,
          description: desc,
          section: row.sectionTitle,
          status: "awaiting",
          complaint: note || null,
          suggestion: {
            ...suggestion,
            parts: mergedParts,
            laborHours: laborTime,
            notes: note || undefined,
          },
          source: "inspection",
          jobType: "repair",
        });

        const createdId = (created as unknown as { id?: unknown })?.id;
        const createdJobId =
          createdId && String(createdId).trim().length > 0
            ? String(createdId).trim()
            : null;

        if (cleanParts.length > 0 && createdJobId) {
          const res = await fetch("/api/parts/requests/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              workOrderId: resolvedWorkOrderId,
              jobId: createdJobId,
              notes: note || null,
              items: cleanParts,
            }),
          });

          if (!res.ok) {
            const body = (await res.json().catch(() => null)) as unknown;
            console.error("Parts request error", body);
            throw new Error("Line added, but parts request failed");
          }
        }

        nextSession = {
          ...nextSession,
          voiceMeta: {
            ...(nextSession.voiceMeta ??
              ({ linesAddedToWorkOrder: 0 } as VoiceMeta)),
            linesAddedToWorkOrder:
              (nextSession.voiceMeta?.linesAddedToWorkOrder ?? 0) + 1,
          },
          sections: nextSession.sections.map((sec, sIdx) => {
            if (sIdx !== row.sectionIndex) return sec;
            return {
              ...sec,
              items: (sec.items ?? []).map((it, iIdx) =>
                iIdx === row.itemIndex
                  ? {
                      ...it,
                      estimateSubmitted: true,
                      estimateSubmittedAt: nowIso,
                      estimateLastUpdatedAt: nowIso,
                      estimateWorkOrderLineId: createdJobId,
                      estimateQuoteLineId: quoteId,
                    }
                  : it,
              ),
            };
          }),
        };
      }

      setSession(nextSession);
      writeDraftSession(draftKey, nextSession);

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("inspection:draft-updated", {
            detail: { draftKey },
          }),
        );
      }

      const payload = summarizeFromSections(nextSession);

      const finishRes = await fetch(
        `/api/work-orders/lines/${resolvedWorkOrderLineId}/finish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      const finishJson = (await finishRes.json().catch(() => null)) as
        | { error?: string }
        | null;

      if (!finishRes.ok) {
        throw new Error(finishJson?.error || "Failed to finish inspection");
      }

      const invoiceRefreshRes = await fetch(
        `/api/work-orders/${resolvedWorkOrderId}/invoice`,
        {
          method: "POST",
          credentials: "include",
          cache: "no-store",
        },
      );

      const invoiceRefreshJson = (await invoiceRefreshRes
        .json()
        .catch(() => null)) as
        | {
            ok?: boolean;
            issues?: Array<{ kind?: string; message?: string }>;
          }
        | null;

      if (!invoiceRefreshRes.ok || invoiceRefreshJson?.ok === false) {
        console.error(
          "[inspection-findings] invoice refresh failed",
          invoiceRefreshJson,
        );
        toast.error(
          invoiceRefreshJson?.issues?.[0]?.message ||
            "Inspection finished, but invoice refresh failed.",
        );
      }

      const pdfRes = await fetch(`/api/inspections/finalize/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workOrderLineId: resolvedWorkOrderLineId }),
      });

      const pdfJson = (await pdfRes.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

      if (!pdfRes.ok || !pdfJson?.ok) {
        toast.error(
          pdfJson?.error || "Inspection finished, but PDF finalize failed.",
        );
      }

      window.dispatchEvent(
        new CustomEvent("inspection:completed", {
          detail: {
            workOrderLineId: resolvedWorkOrderLineId,
            cause: payload.cause,
            correction: payload.correction,
          },
        }),
      );

      window.dispatchEvent(new CustomEvent("inspection:close"));
      toast.success("Inspection findings submitted.");
      router.back();
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Unable to submit findings";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  if (!session) {
    return (
      <PageShell
        title="Inspection findings"
        description="Review findings before submission."
      >
        <div className={cn(PANEL_VARIANTS.secondary, "p-4 text-sm text-neutral-300")}>
          Loading findings…
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Inspection findings"
      description="Review failed and recommended findings before final submission."
    >
      <div className="mx-auto max-w-5xl space-y-4">
        {findings.length === 0 ? (
          <div className={cn(PANEL_VARIANTS.passive, "p-4 text-sm text-neutral-300")}>
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
                    <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-400">
                      Decision unit • {row.sectionTitle}
                    </div>
                    <div className="text-lg font-semibold text-neutral-100">
                      {itemLabel}
                    </div>
                  </div>
                  <StatusBadge
                    variant={status === "fail" ? "danger" : "warning"}
                    className="px-3 py-1 text-[10px]"
                  >
                    {status}
                  </StatusBadge>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                  <div className={cn(PANEL_VARIANTS.secondary, "space-y-3 p-3")}>
                    <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-400">
                      Evidence and technician explanation
                    </div>
                    <label className="space-y-1">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">
                        Technician notes
                      </div>
                      <textarea
                        className="min-h-[110px] w-full rounded-xl border border-white/10 bg-black/40 p-3 text-sm text-white outline-none"
                        value={String(row.item.notes ?? "")}
                        onChange={(e) =>
                          updateFinding(row.sectionIndex, row.itemIndex, {
                            notes: e.target.value,
                          })
                        }
                      />
                    </label>
                    <div>
                      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-neutral-300">
                        <span className="rounded-full border border-white/10 px-3 py-1">
                          Visual proof: {photos.length} photo{photos.length === 1 ? "" : "s"}
                        </span>

                        <input
                          ref={(el) => {
                            fileInputRefs.current[key] = el;
                          }}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            void handleUploadPhoto(row, file);
                          }}
                        />

                        <button
                          type="button"
                          className="rounded-full border border-white/10 px-3 py-1 hover:bg-white/5 disabled:opacity-60"
                          onClick={() => fileInputRefs.current[key]?.click()}
                          disabled={isUploading}
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
                        <div className="rounded-xl border border-dashed border-white/10 bg-black/25 p-3 text-xs text-neutral-500">
                          Add at least one photo for stronger customer approval confidence.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className={cn(PANEL_VARIANTS.passive, "space-y-3 p-3")}>
                    <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-400">
                      Recommendation and scope
                    </div>
                    <label className="space-y-1">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">
                        Labor hours
                      </div>
                      <input
                        type="text"
                        inputMode="decimal"
                        className="w-full rounded-xl border border-white/10 bg-black/40 p-3 text-sm text-white outline-none"
                        value={laborHoursText}
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
                      <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">
                        Parts and quantities
                      </div>
                      <textarea
                        className="min-h-[110px] w-full rounded-xl border border-white/10 bg-black/40 p-3 text-sm text-white outline-none"
                        value={partsText}
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

                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-neutral-300">
                  <button
                    type="button"
                    className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-emerald-200 hover:bg-emerald-500/20"
                    onClick={() => markReviewed(row)}
                  >
                    {reviewed ? "Reviewed" : "Mark reviewed"}
                  </button>

                  <button
                    type="button"
                    className="rounded-full border border-white/10 px-3 py-1 hover:bg-white/5"
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
                    className="rounded-full border border-white/10 px-3 py-1 hover:bg-white/5"
                    onClick={() =>
                      updateFinding(row.sectionIndex, row.itemIndex, {
                        photoReviewed: true,
                      })
                    }
                  >
                    Mark photo reviewed
                  </button>
                </div>
              </div>
            );
          })
        )}

        <div className={cn(PANEL_VARIANTS.secondary, "flex flex-wrap items-center justify-between gap-3 p-4")}>
          <div className="text-sm text-neutral-300">
            Reviewed findings:{" "}
            <span className="font-semibold text-white">
              {
                findings.filter((row) => row.item.findingReviewed === true)
                  .length
              }
            </span>
            {" / "}
            <span className="font-semibold text-white">{findings.length}</span>
          </div>

          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              Back
            </Button>
            <Button type="button" onClick={handleSubmitReviewed} isLoading={busy}>
              {busy ? "Submitting…" : "Submit reviewed findings"}
            </Button>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
