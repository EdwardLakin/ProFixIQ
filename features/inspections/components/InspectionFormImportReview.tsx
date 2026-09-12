"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  INSPECTION_FORM_CONTEXT_BLOCKS,
  RUNNABLE_INSPECTION_FORM_FIELD_TYPES,
  emptyInspectionFormContext,
  isInspectionFormContextEmpty,
  type InspectionFormContext,
  type InspectionFormContextBlock,
  type InspectionFormFieldType,
  type InspectionFormImportView,
  type InspectionFormSection,
} from "@/features/inspections/lib/form-import";
import { Button } from "@shared/components/ui/Button";

const FIELD_TYPE_LABEL: Record<
  (typeof RUNNABLE_INSPECTION_FORM_FIELD_TYPES)[number],
  string
> = {
  check: "Pass / fail",
  defect: "Minor / major defect",
  measurement: "Measurement",
};

const CONTEXT_BLOCK_LABEL: Record<InspectionFormContextBlock, string> = {
  header: "Trip and vehicle header",
  notices: "Printed statements and instructions",
  notes: "Free-text boxes",
  completion: "Completion and signatures",
  branding: "Form identification",
};

const CONTEXT_BLOCK_HINT: Record<InspectionFormContextBlock, string> = {
  header: "Captured at the start of the inspection and printed on the report.",
  notices: "Shown to whoever runs the inspection and printed on the report.",
  notes: "Captured as free text and printed on the report.",
  completion: "Captured when the inspection is completed and signed.",
  branding: "Printed on the report so it stays the customer's document.",
};

const STATE_LABEL: Record<InspectionFormImportView["state"], string> = {
  queued: "Upload saved",
  processing: "Reading form",
  ready_for_review: "Ready for review",
  failed: "Needs another photo",
  approved: "Template saved",
};

export default function InspectionFormImportReview({
  jobId,
  mobile = false,
}: {
  jobId: string;
  mobile?: boolean;
}) {
  const [record, setRecord] = useState<InspectionFormImportView | null>(null);
  const [title, setTitle] = useState("");
  const [sections, setSections] = useState<InspectionFormSection[]>([]);
  const [formContext, setFormContext] = useState<InspectionFormContext>(
    emptyInspectionFormContext,
  );
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/inspection-form-imports/${jobId}`, {
      cache: "no-store",
    });
    const body = (await response.json().catch(() => null)) as
      | { import?: InspectionFormImportView; error?: string }
      | null;
    if (!response.ok || !body?.import) {
      setError(body?.error || "Unable to load this form import.");
      setLoading(false);
      return;
    }
    setRecord(body.import);
    if (!initialized.current && body.import.state === "ready_for_review") {
      initialized.current = true;
      setTitle(body.import.title);
      setSections(body.import.draftSections);
      setFormContext(
        body.import.formContext ?? emptyInspectionFormContext(),
      );
    }
    setLoading(false);
  }, [jobId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (record?.state !== "queued" && record?.state !== "processing") return;
    const interval = window.setInterval(() => void load(), 4000);
    return () => window.clearInterval(interval);
  }, [load, record?.state]);

  /**
   * Persist the review. Approval reads the preserved form context back from
   * the saved import rather than from the approve request, so this has to have
   * landed before approving or an edit made inside the debounce window is lost
   * — and a row promoted to the checklist would be stored twice, once in the
   * runnable sections and once in the stale context.
   */
  const saveReview = useCallback(async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/inspection-form-imports/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, sections, formContext }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) {
        setError(body?.error || "Unable to save your review.");
        return false;
      }
      setDirty(false);
      return true;
    } finally {
      setSaving(false);
    }
  }, [formContext, jobId, sections, title]);

  useEffect(() => {
    if (!dirty || record?.state !== "ready_for_review") return;
    const timeout = window.setTimeout(() => void saveReview(), 700);
    return () => window.clearTimeout(timeout);
  }, [dirty, record?.state, saveReview]);

  const mutateSections = (next: InspectionFormSection[]) => {
    setSections(next);
    setDirty(true);
  };

  const mutateItem = (
    sectionIndex: number,
    itemIndex: number,
    patch: Partial<InspectionFormSection["items"][number]>,
  ) => {
    mutateSections(
      sections.map((entry, index) =>
        index === sectionIndex
          ? {
              ...entry,
              items: entry.items.map((candidate, candidateIndex) =>
                candidateIndex === itemIndex
                  ? { ...candidate, ...patch }
                  : candidate,
              ),
            }
          : entry,
      ),
    );
  };

  /**
   * Move a preserved row back into the runnable checklist. The reader
   * occasionally files a real component row under the header or completion
   * block; without this the reviewer can only delete it or accept the loss.
   * The row rejoins its own printed section so the form's grouping survives.
   */
  const promoteContextItem = (
    block: InspectionFormContextBlock,
    sectionIndex: number,
    itemIndex: number,
  ) => {
    const contextSection = formContext[block][sectionIndex];
    const contextItem = contextSection?.items[itemIndex];
    if (!contextItem) return;

    const promoted = {
      item: contextItem.item,
      unit: contextItem.unit ?? null,
      fieldType: "check" as const,
    };
    const targetIndex = sections.findIndex(
      (entry) => entry.title === contextSection.title,
    );
    setSections(
      targetIndex >= 0
        ? sections.map((entry, index) =>
            index === targetIndex
              ? { ...entry, items: [...entry.items, promoted] }
              : entry,
          )
        : [...sections, { title: contextSection.title, items: [promoted] }],
    );
    setFormContext({
      ...formContext,
      [block]: formContext[block]
        .map((entry, index) =>
          index === sectionIndex
            ? {
                ...entry,
                items: entry.items.filter((_, index2) => index2 !== itemIndex),
              }
            : entry,
        )
        .filter((entry) => entry.items.length > 0),
    });
    setDirty(true);
  };

  const approve = async () => {
    setApproving(true);
    setError(null);
    try {
      // Flush any pending review edit first. Setting dirty=false here would
      // cancel the debounced save instead of completing it.
      if (dirty && !(await saveReview())) return;
      setDirty(false);
      const response = await fetch(`/api/inspection-form-imports/${jobId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, sections }),
      });
      const body = (await response.json().catch(() => null)) as
        | { templateId?: string; error?: string }
        | null;
      if (!response.ok || !body?.templateId) {
        throw new Error(body?.error || "Unable to approve the template.");
      }
      const templateId = body.templateId;
      setRecord((current) =>
        current
          ? { ...current, state: "approved", templateId }
          : current,
      );
      setDirty(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to approve the template.");
    } finally {
      setApproving(false);
    }
  };

  /**
   * Approving an import creates a shop inspection template; it does not reach
   * the fleet's drivers. Publishing adapts it into the driver pre-trip shape
   * and assigns it, which is the step that makes an imported paper form the
   * form drivers actually run.
   */
  const publishToFleet = async () => {
    if (!record?.templateId || !record.fleetId) return;
    setPublishing(true);
    setError(null);
    try {
      const response = await fetch("/api/fleet/pretrip/templates/from-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fleetId: record.fleetId,
          templateId: record.templateId,
          vehicleType: record.vehicleType || undefined,
          operationKey: crypto.randomUUID(),
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string; itemCount?: number; vehicleType?: string }
        | null;
      if (!response.ok) {
        throw new Error(body?.error || "Unable to publish to fleet drivers.");
      }
      setPublished(
        `Published ${body?.itemCount ?? 0} rows to ${record.fleetName || "this fleet"}${body?.vehicleType ? ` for ${body.vehicleType}` : ""}.`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to publish to fleet drivers.",
      );
    } finally {
      setPublishing(false);
    }
  };

  const copyDesktopLink = async () => {
    const url = `${window.location.origin}/inspections/fleet-review?jobId=${jobId}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      setError("Copy was blocked. Open this import from the desktop inspection page instead.");
    }
  };

  if (loading) {
    return <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-5 text-sm text-[color:var(--theme-text-secondary)]">Loading form import…</div>;
  }
  if (!record) {
    return <div className="rounded-2xl border border-red-500/50 bg-red-950/30 p-4 text-sm text-red-200">{error || "Form import not found."}</div>;
  }

  const progress = Math.round(
    (record.processedPages / Math.max(1, record.totalPages)) * 100,
  );

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent-copper)]">Form import</div>
            <h1 className="mt-1 text-lg font-semibold text-[color:var(--theme-text-primary)]">{record.title}</h1>
            <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">{record.customerName || record.fleetName || "Shop inspection template"} · {record.totalPages} page{record.totalPages === 1 ? "" : "s"}</p>
          </div>
          <span className="shrink-0 rounded-full border border-[color:var(--theme-border-soft)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]">{STATE_LABEL[record.state]}</span>
        </div>
        {(record.state === "queued" || record.state === "processing") ? (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-[color:var(--theme-text-secondary)]"><span>You can leave this page. Processing continues in the background.</span><span>{progress}%</span></div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[color:var(--theme-surface-inset)]"><div className="h-full rounded-full bg-[var(--accent-copper)] transition-all" style={{ width: `${Math.max(6, progress)}%` }} /></div>
          </div>
        ) : null}
      </section>

      {error ? <div className="rounded-xl border border-red-500/50 bg-red-950/30 p-3 text-sm text-red-200">{error}</div> : null}
      {record.failedPages.length ? (
        <div className="rounded-xl border border-amber-500/50 bg-amber-950/20 p-3 text-sm text-amber-100">
          {record.failedPages.map((page) => <div key={page.page}>Page {page.page}: {page.message}</div>)}
        </div>
      ) : null}

      {record.state === "failed" ? (
        <Link href={mobile ? "/mobile/inspections/import" : "/inspections/fleet-import"} className="block rounded-xl border border-[var(--accent-copper)] p-4 text-center text-sm font-semibold">Retake and upload the form</Link>
      ) : null}

      {record.state === "approved" ? (
        <section className="rounded-2xl border border-emerald-500/50 bg-emerald-950/20 p-5 text-center">
          <div className="text-lg font-semibold text-emerald-100">Inspection template saved</div>
          <p className="mt-1 text-sm text-emerald-200/80">It is now available with the shop’s normal inspection templates.</p>
          <Link href={mobile ? "/mobile/inspections" : "/inspections/templates"} className="mt-4 inline-flex rounded-xl border border-emerald-400/50 px-4 py-2 text-sm font-semibold">View inspections</Link>

          {record.fleetId ? (
            <div className="mt-4 border-t border-emerald-500/30 pt-4">
              {published ? (
                <p className="text-sm text-emerald-200/90">{published}</p>
              ) : (
                <>
                  <p className="text-xs text-emerald-200/80">
                    Drivers in {record.fleetName || "this fleet"} still run their assigned pre-trip. Publish this form to make it the one they run.
                  </p>
                  <Button type="button" variant="copper" size="lg" isLoading={publishing} onClick={() => void publishToFleet()} className="mt-3 w-full">Publish to fleet drivers</Button>
                </>
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      {record.state === "ready_for_review" ? (
        <>
          {mobile ? (
            <section className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] p-3 text-sm">
              <div className="font-semibold">Want the larger editor?</div>
              <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">Open Import inspection form on a computer. This saved review will already be there.</p>
              <button type="button" onClick={() => void copyDesktopLink()} className="mt-2 text-xs font-semibold text-[var(--accent-copper)]">Copy desktop link</button>
            </section>
          ) : null}

          <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold uppercase tracking-[0.14em]">Review template</h2><span className="text-xs text-[color:var(--theme-text-secondary)]">{saving ? "Saving…" : dirty ? "Unsaved" : "Saved"}</span></div>
            <label className="text-xs text-[color:var(--theme-text-secondary)]">Template name<input value={title} onChange={(event) => { setTitle(event.target.value); setDirty(true); }} className="mt-1 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-3 text-sm text-[color:var(--theme-text-primary)]" /></label>
            <div className="mt-4 space-y-3">
              {sections.map((section, sectionIndex) => (
                <div key={sectionIndex} className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
                  <div className="flex gap-2"><input value={section.title} onChange={(event) => mutateSections(sections.map((entry, index) => index === sectionIndex ? { ...entry, title: event.target.value } : entry))} className="min-w-0 flex-1 rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-2 py-2 text-sm font-semibold" /><button type="button" onClick={() => mutateSections(sections.filter((_, index) => index !== sectionIndex))} className="px-2 text-xs text-red-300">Remove</button></div>
                  <div className="mt-2 space-y-2">
                    {section.items.map((item, itemIndex) => {
                      // Imports approved before field types were reviewable can
                      // still be missing one. Fall back the same way the
                      // imported-template editor does so the row stays fixable.
                      const fieldType: InspectionFormFieldType =
                        item.fieldType ?? (item.unit ? "measurement" : "check");
                      return (
                      <div key={itemIndex} className="flex flex-wrap items-center gap-2">
                        <input aria-label={`Label for ${item.item}`} value={item.item} onChange={(event) => mutateItem(sectionIndex, itemIndex, { item: event.target.value })} className="min-w-0 flex-1 basis-full sm:basis-0 rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-2 py-2 text-xs" />
                        <select aria-label={`Field type for ${item.item}`} value={fieldType} onChange={(event) => { const nextType = event.target.value as InspectionFormFieldType; mutateItem(sectionIndex, itemIndex, { fieldType: nextType, ...(nextType === "measurement" ? {} : { unit: null }) }); }} className="w-[9.5rem] shrink-0 rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-2 py-2 text-xs">
                          {RUNNABLE_INSPECTION_FORM_FIELD_TYPES.map((type) => <option key={type} value={type}>{FIELD_TYPE_LABEL[type]}</option>)}
                        </select>
                        <input aria-label={`Unit for ${item.item}`} value={item.unit ?? ""} placeholder="Unit" disabled={fieldType !== "measurement"} title={fieldType === "measurement" ? undefined : "Units apply to measurement rows only."} onChange={(event) => mutateItem(sectionIndex, itemIndex, { unit: event.target.value || null })} className="w-[4.5rem] shrink-0 rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-2 py-2 text-xs disabled:opacity-40" />
                        <button type="button" aria-label={`Remove ${item.item}`} onClick={() => mutateSections(sections.map((entry, index) => index === sectionIndex ? { ...entry, items: entry.items.filter((_, candidateIndex) => candidateIndex !== itemIndex) } : entry))} className="px-2 text-red-300">×</button>
                      </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <Button type="button" variant="copper" size="lg" isLoading={approving} disabled={!title.trim() || !sections.length} onClick={() => void approve()} className="mt-4 w-full">Approve and save template</Button>
          </section>

          {!isInspectionFormContextEmpty(formContext) ? (
            <section className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4">
              <h2 className="text-sm font-semibold uppercase tracking-[0.14em]">Kept from the form</h2>
              <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                These are not checklist rows, so they are stored with the template and used when the inspection is run and reported. If the reader misfiled a real inspection item here, move it into the checklist.
              </p>
              <div className="mt-4 space-y-4">
                {INSPECTION_FORM_CONTEXT_BLOCKS.filter((block) => formContext[block].length > 0).map((block) => (
                  <div key={block}>
                    <div className="text-xs font-semibold text-[color:var(--theme-text-primary)]">{CONTEXT_BLOCK_LABEL[block]}</div>
                    <div className="text-[11px] text-[color:var(--theme-text-secondary)]">{CONTEXT_BLOCK_HINT[block]}</div>
                    <div className="mt-2 space-y-2">
                      {formContext[block].map((section, sectionIndex) => (
                        <div key={`${section.title}-${sectionIndex}`} className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--theme-text-secondary)]">{section.title}</div>
                          <ul className="mt-2 space-y-1">
                            {section.items.map((item, itemIndex) => (
                              <li key={`${item.item}-${itemIndex}`} className="flex items-start justify-between gap-3 text-xs text-[color:var(--theme-text-primary)]">
                                <span className="min-w-0 flex-1 break-words">{item.item}</span>
                                <button type="button" onClick={() => promoteContextItem(block, sectionIndex, itemIndex)} className="shrink-0 text-[11px] font-semibold text-[var(--accent-copper)]">Move to checklist</button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {!mobile && record.extractedText ? (
            <details className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel)] p-4">
              <summary className="cursor-pointer text-sm font-semibold">View detected form text</summary>
              <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap text-xs text-[color:var(--theme-text-secondary)]">{record.extractedText}</pre>
            </details>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
