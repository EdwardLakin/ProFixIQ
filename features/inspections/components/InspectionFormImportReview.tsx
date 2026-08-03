"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import type {
  InspectionFormImportView,
  InspectionFormSection,
} from "@/features/inspections/lib/form-import";
import { Button } from "@shared/components/ui/Button";

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
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
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

  useEffect(() => {
    if (!dirty || record?.state !== "ready_for_review") return;
    const timeout = window.setTimeout(async () => {
      setSaving(true);
      const response = await fetch(`/api/inspection-form-imports/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, sections }),
      });
      const body = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) setError(body?.error || "Unable to save your review.");
      else setDirty(false);
      setSaving(false);
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [dirty, jobId, record?.state, sections, title]);

  const mutateSections = (next: InspectionFormSection[]) => {
    setSections(next);
    setDirty(true);
  };

  const approve = async () => {
    setDirty(false);
    setApproving(true);
    setError(null);
    try {
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
                    {section.items.map((item, itemIndex) => (
                      <div key={itemIndex} className="grid grid-cols-[minmax(0,1fr),4.5rem,auto] gap-2">
                        <input value={item.item} onChange={(event) => mutateSections(sections.map((entry, index) => index === sectionIndex ? { ...entry, items: entry.items.map((candidate, candidateIndex) => candidateIndex === itemIndex ? { ...candidate, item: event.target.value } : candidate) } : entry))} className="min-w-0 rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-2 py-2 text-xs" />
                        <input value={item.unit ?? ""} placeholder="Unit" onChange={(event) => mutateSections(sections.map((entry, index) => index === sectionIndex ? { ...entry, items: entry.items.map((candidate, candidateIndex) => candidateIndex === itemIndex ? { ...candidate, unit: event.target.value || null } : candidate) } : entry))} className="rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-page)] px-2 py-2 text-xs" />
                        <button type="button" aria-label={`Remove ${item.item}`} onClick={() => mutateSections(sections.map((entry, index) => index === sectionIndex ? { ...entry, items: entry.items.filter((_, candidateIndex) => candidateIndex !== itemIndex) } : entry))} className="px-2 text-red-300">×</button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <Button type="button" variant="copper" size="lg" isLoading={approving} disabled={!title.trim() || !sections.length} onClick={() => void approve()} className="mt-4 w-full">Approve and save template</Button>
          </section>

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
