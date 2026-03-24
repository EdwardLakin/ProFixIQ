//features/inspections/lib/inspection/findings/page.tsx

"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import PageShell from "@/features/shared/components/PageShell";
import { Button } from "@shared/components/ui/Button";
import type {
  InspectionItemStatus,
  InspectionSession,
} from "@inspections/lib/inspection/types";

type FindingStatus = "fail" | "recommend";

type FindingCard = {
  key: string;
  sectionIndex: number;
  itemIndex: number;
  sectionTitle: string;
  itemLabel: string;
  status: FindingStatus;
  notes: string;
  photoUrls: string[];
  parts: Array<{ description: string; qty: number }>;
  laborHours: number | null;
  estimateSubmitted: boolean;
  estimateSubmittedAt: string | null;
  estimateWorkOrderLineId: string | null;
  estimateQuoteLineId: string | null;
};

function readJson<T>(key: string): T | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
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

function asStatus(value: unknown): InspectionItemStatus | "" {
  const s = String(value ?? "").toLowerCase().trim();
  if (s === "ok" || s === "fail" || s === "na" || s === "recommend") {
    return s;
  }
  if (s === "pass" || s === "okay") return "ok";
  if (s === "rec") return "recommend";
  return "";
}

function getItemLabel(item: unknown): string {
  const rec = item as {
    item?: unknown;
    name?: unknown;
    description?: unknown;
    title?: unknown;
  };
  return String(
    rec?.item ?? rec?.name ?? rec?.description ?? rec?.title ?? "Item",
  ).trim();
}

function getNotes(item: unknown): string {
  const rec = item as { notes?: unknown; note?: unknown };
  return String(rec?.notes ?? rec?.note ?? "").trim();
}

function getPhotoUrls(item: unknown): string[] {
  const rec = item as { photoUrls?: unknown };
  if (!Array.isArray(rec?.photoUrls)) return [];
  return rec.photoUrls
    .map((x) => String(x ?? "").trim())
    .filter((x) => x.length > 0);
}

function getParts(
  item: unknown,
): Array<{ description: string; qty: number }> {
  const rec = item as { parts?: unknown };
  if (!Array.isArray(rec?.parts)) return [];
  return rec.parts
    .map((row) => {
      const part = row as { description?: unknown; qty?: unknown };
      const description = String(part?.description ?? "").trim();
      const qtyNum = Number(part?.qty ?? 0);
      return {
        description,
        qty: Number.isFinite(qtyNum) ? qtyNum : 0,
      };
    })
    .filter((p) => p.description.length > 0 || p.qty > 0);
}

function getLaborHours(item: unknown): number | null {
  const rec = item as { laborHours?: unknown };
  return typeof rec?.laborHours === "number" && Number.isFinite(rec.laborHours)
    ? rec.laborHours
    : null;
}

function getFindingCards(session: InspectionSession | null): FindingCard[] {
  if (!session?.sections?.length) return [];

  const cards: FindingCard[] = [];

  session.sections.forEach((section, sectionIndex) => {
    const sectionTitle = String(section?.title ?? "Section").trim() || "Section";
    const items = Array.isArray(section?.items) ? section.items : [];

    items.forEach((item, itemIndex) => {
      const status = asStatus((item as { status?: unknown }).status);
      if (status !== "fail" && status !== "recommend") return;

      const ext = item as {
        estimateSubmitted?: unknown;
        estimateSubmittedAt?: unknown;
        estimateWorkOrderLineId?: unknown;
        estimateQuoteLineId?: unknown;
      };

      cards.push({
        key: `${sectionIndex}:${itemIndex}:${getItemLabel(item)}`,
        sectionIndex,
        itemIndex,
        sectionTitle,
        itemLabel: getItemLabel(item),
        status,
        notes: getNotes(item),
        photoUrls: getPhotoUrls(item),
        parts: getParts(item),
        laborHours: getLaborHours(item),
        estimateSubmitted: ext.estimateSubmitted === true,
        estimateSubmittedAt:
          typeof ext.estimateSubmittedAt === "string"
            ? ext.estimateSubmittedAt
            : null,
        estimateWorkOrderLineId:
          typeof ext.estimateWorkOrderLineId === "string"
            ? ext.estimateWorkOrderLineId
            : null,
        estimateQuoteLineId:
          typeof ext.estimateQuoteLineId === "string"
            ? ext.estimateQuoteLineId
            : null,
      });
    });
  });

  return cards;
}

function buildRunHref(args: {
  templateName: string;
  inspectionId: string;
  workOrderId: string | null;
  workOrderLineId: string | null;
}) {
  const qs = new URLSearchParams();
  if (args.templateName) qs.set("template", args.templateName);
  if (args.inspectionId) qs.set("inspectionId", args.inspectionId);
  if (args.workOrderId) qs.set("workOrderId", args.workOrderId);
  if (args.workOrderLineId) qs.set("workOrderLineId", args.workOrderLineId);
  return `/inspection/run?${qs.toString()}`;
}

export default function InspectionFindingsPage() {
  const sp = useSearchParams();

  const inspectionId = sp.get("inspectionId") || "";
  const workOrderId = sp.get("workOrderId");
  const workOrderLineId = sp.get("workOrderLineId");
  const templateName =
    sp.get("template") ||
    (typeof window !== "undefined"
      ? window.sessionStorage.getItem("inspection:title")
      : null) ||
    "Inspection";

  const draftKey = useMemo(
    () =>
      inspectionDraftKey({
        inspectionId,
        workOrderId,
        workOrderLineId,
        templateName,
      }),
    [inspectionId, workOrderId, workOrderLineId, templateName],
  );

  const session = useMemo(
    () => readJson<InspectionSession>(draftKey),
    [draftKey],
  );

  const findings = useMemo(() => getFindingCards(session), [session]);

  const failed = findings.filter((x) => x.status === "fail");
  const recommended = findings.filter((x) => x.status === "recommend");

  const runHref = buildRunHref({
    templateName,
    inspectionId,
    workOrderId,
    workOrderLineId,
  });

  return (
    <PageShell
      title="Inspection Findings"
      description="Review failed and recommended items before finalizing the inspection."
    >
      <div className="mx-auto w-full max-w-6xl px-3 py-4 md:px-4 md:py-6">
        <div className="mb-4 rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/65 px-4 py-4 shadow-[0_24px_80px_rgba(0,0,0,0.95)] backdrop-blur-xl">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-400">
                Review Flow
              </div>
              <h1 className="mt-1 text-lg font-semibold text-neutral-50 md:text-xl">
                {templateName || "Inspection"}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-neutral-400">
                {workOrderId ? (
                  <span className="rounded-full border border-white/10 bg-black/40 px-2 py-1">
                    Work Order Attached
                  </span>
                ) : null}
                {workOrderLineId ? (
                  <span className="rounded-full border border-white/10 bg-black/40 px-2 py-1">
                    Line Attached
                  </span>
                ) : null}
                {inspectionId ? (
                  <span className="rounded-full border border-white/10 bg-black/40 px-2 py-1">
                    Inspection Active
                  </span>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link href={runHref}>
                <Button
                  type="button"
                  variant="outline"
                  className="text-[11px] uppercase tracking-[0.16em]"
                >
                  Back to inspection
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {!session ? (
          <div className="rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/65 px-4 py-6 text-sm text-neutral-300 shadow-[0_24px_80px_rgba(0,0,0,0.95)] backdrop-blur-xl">
            No active inspection draft was found for this route.
          </div>
        ) : findings.length === 0 ? (
          <div className="rounded-2xl border border-[color:var(--metal-border-soft,#1f2937)] bg-black/65 px-4 py-6 text-sm text-neutral-300 shadow-[0_24px_80px_rgba(0,0,0,0.95)] backdrop-blur-xl">
            No failed or recommended findings to review.
          </div>
        ) : (
          <div className="space-y-5">
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-[12px] font-semibold uppercase tracking-[0.18em] text-red-200">
                  Failed Items ({failed.length})
                </h2>
              </div>

              {failed.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-black/45 px-4 py-3 text-sm text-neutral-400">
                  No failed items.
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {failed.map((card) => (
                    <div
                      key={card.key}
                      className="rounded-2xl border border-red-500/20 bg-black/60 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.85)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">
                            {card.sectionTitle}
                          </div>
                          <div className="mt-1 text-base font-semibold text-neutral-100">
                            {card.itemLabel}
                          </div>
                        </div>

                        <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-red-200">
                          Fail
                        </span>
                      </div>

                      <div className="mt-3 space-y-3 text-sm text-neutral-300">
                        <div>
                          <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">
                            Notes
                          </div>
                          <div className="mt-1 rounded-lg border border-white/10 bg-black/35 px-3 py-2">
                            {card.notes || "No notes added yet."}
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">
                              Photos
                            </div>
                            <div className="mt-1 rounded-lg border border-white/10 bg-black/35 px-3 py-2">
                              {card.photoUrls.length}
                            </div>
                          </div>

                          <div>
                            <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">
                              Labor Hours
                            </div>
                            <div className="mt-1 rounded-lg border border-white/10 bg-black/35 px-3 py-2">
                              {card.laborHours ?? "—"}
                            </div>
                          </div>
                        </div>

                        <div>
                          <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">
                            Parts
                          </div>
                          <div className="mt-1 rounded-lg border border-white/10 bg-black/35 px-3 py-2">
                            {card.parts.length === 0 ? (
                              <span className="text-neutral-500">
                                No parts added yet.
                              </span>
                            ) : (
                              <ul className="space-y-1">
                                {card.parts.map((p, idx) => (
                                  <li key={`${card.key}-part-${idx}`}>
                                    {p.qty > 0 ? `${p.qty}× ` : ""}
                                    {p.description || "Part"}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <span
                            className={[
                              "rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]",
                              card.estimateSubmitted
                                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                                : "border-amber-500/30 bg-amber-500/10 text-amber-200",
                            ].join(" ")}
                          >
                            {card.estimateSubmitted
                              ? "Estimate submitted"
                              : "Needs estimate review"}
                          </span>

                          {card.estimateSubmittedAt ? (
                            <span className="text-[10px] text-neutral-500">
                              {new Date(card.estimateSubmittedAt).toLocaleString()}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-[12px] font-semibold uppercase tracking-[0.18em] text-amber-200">
                  Recommended Items ({recommended.length})
                </h2>
              </div>

              {recommended.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-black/45 px-4 py-3 text-sm text-neutral-400">
                  No recommended items.
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {recommended.map((card) => (
                    <div
                      key={card.key}
                      className="rounded-2xl border border-amber-500/20 bg-black/60 p-4 shadow-[0_18px_45px_rgba(0,0,0,0.85)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">
                            {card.sectionTitle}
                          </div>
                          <div className="mt-1 text-base font-semibold text-neutral-100">
                            {card.itemLabel}
                          </div>
                        </div>

                        <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200">
                          Recommend
                        </span>
                      </div>

                      <div className="mt-3 space-y-3 text-sm text-neutral-300">
                        <div>
                          <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">
                            Notes
                          </div>
                          <div className="mt-1 rounded-lg border border-white/10 bg-black/35 px-3 py-2">
                            {card.notes || "No notes added yet."}
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">
                              Photos
                            </div>
                            <div className="mt-1 rounded-lg border border-white/10 bg-black/35 px-3 py-2">
                              {card.photoUrls.length}
                            </div>
                          </div>

                          <div>
                            <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">
                              Labor Hours
                            </div>
                            <div className="mt-1 rounded-lg border border-white/10 bg-black/35 px-3 py-2">
                              {card.laborHours ?? "—"}
                            </div>
                          </div>
                        </div>

                        <div>
                          <div className="text-[11px] uppercase tracking-[0.16em] text-neutral-500">
                            Parts
                          </div>
                          <div className="mt-1 rounded-lg border border-white/10 bg-black/35 px-3 py-2">
                            {card.parts.length === 0 ? (
                              <span className="text-neutral-500">
                                No parts added yet.
                              </span>
                            ) : (
                              <ul className="space-y-1">
                                {card.parts.map((p, idx) => (
                                  <li key={`${card.key}-part-${idx}`}>
                                    {p.qty > 0 ? `${p.qty}× ` : ""}
                                    {p.description || "Part"}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <span
                            className={[
                              "rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]",
                              card.estimateSubmitted
                                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                                : "border-amber-500/30 bg-amber-500/10 text-amber-200",
                            ].join(" ")}
                          >
                            {card.estimateSubmitted
                              ? "Estimate submitted"
                              : "Needs estimate review"}
                          </span>

                          {card.estimateSubmittedAt ? (
                            <span className="text-[10px] text-neutral-500">
                              {new Date(card.estimateSubmittedAt).toLocaleString()}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </PageShell>
  );
}