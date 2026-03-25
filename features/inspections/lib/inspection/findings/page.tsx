"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import type {
  InspectionItem,
  InspectionItemStatus,
  InspectionSession,
} from "@inspections/lib/inspection/types";
import PageShell from "@/features/shared/components/PageShell";
import { Button } from "@shared/components/ui/Button";
import PhotoThumbnail from "@inspections/components/inspection/PhotoThumbnail";

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

  const syncFromDraft = useCallback(() => {
    const loaded = readDraftSession(draftKey);
    if (loaded) {
      setSession(loaded);
    }
  }, [draftKey]);

  useEffect(() => {
    syncFromDraft();
  }, [syncFromDraft]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleFocus = () => syncFromDraft();
    const handlePageShow = () => syncFromDraft();

    // fires for other tabs/windows; not same-tab writes
    const handleStorage = (e: StorageEvent) => {
      if (e.key === draftKey) syncFromDraft();
    };

    // custom same-tab sync event
    const handleInspectionDraftUpdated = (e: Event) => {
      const custom = e as CustomEvent<{ draftKey?: string }>;
      if (!custom.detail?.draftKey || custom.detail.draftKey === draftKey) {
        syncFromDraft();
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
    if (!inspectionId) {
      toast.error("Missing inspection id.");
      return;
    }

    const key = findingKey(row.sectionIndex, row.itemIndex);
    const itemLabel = String(row.item.item ?? row.item.name ?? "Item");

    setUploadingKey(key);

    try {
      const form = new FormData();
      form.append("inspectionId", inspectionId);
      if (workOrderId) form.append("workOrderId", workOrderId);
      if (workOrderLineId) form.append("workOrderLineId", workOrderLineId);
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
    if (!workOrderLineId) {
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

    setBusy(true);
    try {
      writeDraftSession(draftKey, session);

      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("inspection:draft-updated", {
            detail: { draftKey },
          }),
        );
      }

      const payload = summarizeFromSections(session);

      const finishRes = await fetch(
        `/api/work-orders/lines/${workOrderLineId}/finish`,
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

      const pdfRes = await fetch(`/api/inspections/finalize/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workOrderLineId }),
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
            workOrderLineId,
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
        <div className="rounded-2xl border border-white/10 bg-black/50 p-4 text-sm text-neutral-300">
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
          <div className="rounded-2xl border border-white/10 bg-black/50 p-4 text-sm text-neutral-300">
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
                className="rounded-2xl border border-white/10 bg-black/60 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-400">
                      {row.sectionTitle}
                    </div>
                    <div className="text-lg font-semibold text-neutral-100">
                      {itemLabel}
                    </div>
                  </div>
                  <div
                    className={[
                      "rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]",
                      status === "fail"
                        ? "border border-red-500/40 bg-red-500/15 text-red-200"
                        : "border border-amber-500/40 bg-amber-500/15 text-amber-200",
                    ].join(" ")}
                  >
                    {status}
                  </div>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="space-y-1">
                    <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-400">
                      Note
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

                  <div className="space-y-3">
                    <label className="space-y-1">
                      <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-400">
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
                      <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-400">
                        Parts
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
                  <span className="rounded-full border border-white/10 px-3 py-1">
                    Photos: {photos.length}
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
                    {isUploading ? "Uploading photo..." : "Add photo"}
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

                  <button
                    type="button"
                    className="rounded-full border border-emerald-500/30 px-3 py-1 text-emerald-200 hover:bg-emerald-500/10"
                    onClick={() => markReviewed(row)}
                  >
                    {reviewed ? "Reviewed" : "Mark reviewed"}
                  </button>
                </div>
                  {photos.length > 0 && (
                    <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                      {photos.map((url, i) => (
                        <PhotoThumbnail key={`${url}-${i}`} url={url} />
                      ))}
                  </div>
                  )}
              </div>
            );
          })
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/60 p-4">
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