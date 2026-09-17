"use client";

import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Mic,
  Search,
  Send,
} from "lucide-react";

import { cn } from "@shared/lib/utils";

export type InspectionWorkspaceSection = {
  id: string;
  title: string;
  subtitle?: string | null;
  completed: number;
  total: number;
};

export type InspectionWorkspaceFinding = {
  id: string;
  title: string;
  status: "fail" | "recommend";
  summary?: string | null;
  meta?: ReactNode;
};

export type InspectionWorkspaceCounts = {
  fail: number;
  recommend: number;
  passOrNa: number;
  workOrderLines: number;
};

type InspectionWorkspaceShellProps = {
  title: string;
  subtitle?: string | null;
  sections: readonly InspectionWorkspaceSection[];
  activeSectionId: string | null;
  onSelectSection: (sectionId: string) => void;
  counts: InspectionWorkspaceCounts;
  completedSections: number;
  totalSections: number;
  center: ReactNode;
  voiceControl?: ReactNode;
  reviewFindingsControl?: ReactNode;
  addPhotoControl?: ReactNode;
  signControl?: ReactNode;
  submitControl?: ReactNode;
  findings?: readonly InspectionWorkspaceFinding[];
  technicianNotes?: ReactNode;
  footer?: ReactNode;
  className?: string;
};

function progressPercent(completed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((completed / total) * 100)));
}

function railButtonClass(active = false): string {
  return cn(
    "group flex min-h-[58px] w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition",
    active
      ? "border-sky-400/50 bg-sky-500/10 shadow-[inset_3px_0_0_rgba(14,165,233,0.9)]"
      : "border-transparent bg-transparent hover:border-[color:var(--theme-border-soft)] hover:bg-[color:var(--theme-surface-subtle)]",
  );
}

function DefaultControl({
  icon,
  label,
  emphasis = false,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  emphasis?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition",
        emphasis
          ? "border-sky-500/70 bg-sky-600 text-white hover:bg-sky-500"
          : "border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-subtle)]",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

export default function InspectionWorkspaceShell({
  title,
  subtitle,
  sections,
  activeSectionId,
  onSelectSection,
  counts,
  completedSections,
  totalSections,
  center,
  voiceControl,
  reviewFindingsControl,
  addPhotoControl,
  signControl,
  submitControl,
  findings = [],
  technicianNotes,
  footer,
  className,
}: InspectionWorkspaceShellProps): JSX.Element {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const visibleSections = useMemo(
    () =>
      normalizedQuery.length === 0
        ? sections
        : sections.filter((section) =>
            `${section.title} ${section.subtitle ?? ""}`
              .toLowerCase()
              .includes(normalizedQuery),
          ),
    [normalizedQuery, sections],
  );

  const activeSection = useMemo(
    () => sections.find((section) => section.id === activeSectionId) ?? null,
    [activeSectionId, sections],
  );
  const overallPercent = progressPercent(completedSections, totalSections);
  const visibleSubtitle =
    subtitle && !subtitle.toLowerCase().includes("canonical") ? subtitle : null;

  const clickCanonicalVoice = useCallback(() => {
    if (typeof document === "undefined") return;
    const control = document.querySelector<HTMLButtonElement>(
      '[data-inspection-workspace-runtime] [data-inspection-voice-start-control="true"]',
    );
    control?.click();
  }, []);

  const focusCanonicalPanel = useCallback((needle: string) => {
    if (typeof document === "undefined") return;
    const root = document.querySelector<HTMLElement>(
      "[data-inspection-workspace-runtime]",
    );
    if (!root) return;
    const normalized = needle.toLowerCase();
    const candidate = Array.from(
      root.querySelectorAll<HTMLElement>("button, h2, h3, label, div"),
    ).find((element) =>
      String(element.textContent ?? "").trim().toLowerCase().includes(normalized),
    );
    candidate?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const focusFinding = useCallback(
    (finding: InspectionWorkspaceFinding) => {
      if (typeof document === "undefined") return;
      const [sectionId] = finding.id.split(":");
      if (!sectionId) return;

      onSelectSection(sectionId);

      const locate = () => {
        const section = document.querySelector<HTMLElement>(
          `[data-inspection-workspace-runtime] [data-section-index="${sectionId}"]`,
        );
        if (!section) return;

        const title = finding.title.trim().toLowerCase();
        const label = Array.from(
          section.querySelectorAll<HTMLElement>("span, h3, h4, button, div"),
        ).find(
          (element) =>
            String(element.textContent ?? "").trim().toLowerCase() === title,
        );
        if (!label) return;

        const item = label.closest<HTMLElement>("div.relative") ?? label;
        item.scrollIntoView({ behavior: "smooth", block: "center" });
        const focusable = item.querySelector<HTMLElement>(
          "button, input, textarea, select, [tabindex]:not([tabindex='-1'])",
        );
        focusable?.focus({ preventScroll: true });
      };

      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(locate);
      });
      window.setTimeout(locate, 80);
    },
    [onSelectSection],
  );

  const activeSelector =
    activeSectionId == null
      ? ""
      : `[data-inspection-workspace-runtime] [data-section-index=\"${activeSectionId}\"]`;

  return (
    <section
      data-inspection-workspace
      data-active-section-id={activeSectionId ?? undefined}
      className={cn(
        "grid min-h-0 gap-3 xl:grid-cols-[260px_minmax(0,1fr)_320px] 2xl:grid-cols-[280px_minmax(0,1fr)_340px]",
        className,
      )}
    >
      <style>{`
        [data-inspection-workspace-runtime] .inspection-embed {
          max-width: none !important;
          padding: 0 !important;
          margin: 0 !important;
        }
        [data-inspection-workspace-runtime] [data-section-index] {
          display: none !important;
        }
        ${activeSelector} {
          display: block !important;
          opacity: 1 !important;
          margin: 0 !important;
        }
        [data-inspection-workspace-runtime] .inspection-embed > .relative.space-y-3 > div:has([data-inspection-customer-vehicle-header]) {
          display: none !important;
        }
        [data-inspection-workspace-runtime] .rounded-2xl:has([data-inspection-voice-start-control="true"]) {
          display: none !important;
        }
        [data-inspection-workspace-runtime] [class*="lg:grid-cols-[minmax(0,1fr)_auto]"] {
          grid-template-columns: minmax(0, 1fr) !important;
          align-items: start !important;
        }
        [data-inspection-workspace-runtime] [class*="lg:grid-cols-[minmax(0,1fr)_240px]"] {
          grid-template-columns: minmax(0, 1fr) !important;
        }
        [data-inspection-workspace-runtime] [aria-label="Bulk section actions"] {
          width: 100% !important;
          justify-content: flex-start !important;
        }
        [data-inspection-workspace-runtime] [data-section-index] h2,
        [data-inspection-workspace-runtime] [data-section-index] button[aria-expanded] {
          white-space: normal !important;
          overflow: visible !important;
          text-overflow: clip !important;
        }
        [data-inspection-workspace-runtime] [data-section-index] {
          overflow-x: auto;
        }
        [data-inspection-workspace-runtime] [data-section-index] input,
        [data-inspection-workspace-runtime] [data-section-index] textarea,
        [data-inspection-workspace-runtime] [data-section-index] button {
          min-width: 0;
        }
      `}</style>

      <aside
        data-inspection-workspace-sections
        className="min-h-0 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel-strong)] p-3 shadow-[var(--theme-shadow-soft)]"
      >
        <div className="px-1 pb-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-[color:var(--theme-text-primary)]">
                Inspection Sections
              </h2>
              <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                {totalSections} sections
              </p>
            </div>
            <span className="shrink-0 rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-2 py-1 text-xs font-semibold text-[color:var(--theme-text-secondary)]">
              {overallPercent}%
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[color:var(--theme-surface-subtle)]">
            <div
              className="h-full rounded-full bg-sky-500 transition-[width]"
              style={{ width: `${overallPercent}%` }}
            />
          </div>
        </div>

        <label className="mb-2 flex min-h-10 items-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 text-sm text-[color:var(--theme-text-secondary)]">
          <Search className="h-4 w-4 shrink-0" aria-hidden />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search sections..."
            className="min-w-0 flex-1 bg-transparent text-[color:var(--theme-text-primary)] outline-none placeholder:text-[color:var(--theme-text-muted)]"
            aria-label="Search inspection sections"
          />
        </label>

        <div className="max-h-[calc(100dvh-22rem)] space-y-1 overflow-y-auto pr-1 xl:max-h-[calc(100dvh-17rem)]">
          {visibleSections.map((section) => {
            const active = section.id === activeSectionId;
            const complete =
              section.total > 0 &&
              section.completed > 0 &&
              section.completed >= section.total;
            const partial =
              section.completed > 0 && section.completed < section.total;
            return (
              <button
                key={section.id}
                type="button"
                className={railButtonClass(active)}
                onClick={() => onSelectSection(section.id)}
                aria-current={active ? "step" : undefined}
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] text-[color:var(--theme-text-secondary)]">
                  {complete ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden />
                  ) : active ? (
                    <Circle className="h-4 w-4 fill-sky-500/20 text-sky-500" aria-hidden />
                  ) : (
                    <Circle className="h-4 w-4" aria-hidden />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block whitespace-normal break-words text-sm font-semibold leading-5 text-[color:var(--theme-text-primary)]">
                    {section.title}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-[color:var(--theme-text-muted)]">
                    {partial
                      ? `${section.completed} completed · ${section.total} items`
                      : `${section.total} ${section.total === 1 ? "item" : "items"}`}
                  </span>
                </span>
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-[color:var(--theme-text-muted)] transition group-hover:translate-x-0.5"
                  aria-hidden
                />
              </button>
            );
          })}
        </div>
      </aside>

      <main
        data-inspection-workspace-center
        className="min-w-0 overflow-hidden rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel-strong)] shadow-[var(--theme-shadow-soft)]"
      >
        <div className="border-b border-[color:var(--theme-border-soft)] px-4 py-4 md:px-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-500">
            Inspection workspace
          </div>
          <h2 className="mt-1 whitespace-normal break-words text-xl font-semibold leading-tight text-[color:var(--theme-text-primary)] md:text-2xl">
            {activeSection?.title || title}
          </h2>
          <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
            {title}
            {visibleSubtitle ? ` · ${visibleSubtitle}` : ""}
          </p>
        </div>
        <div
          data-inspection-workspace-runtime
          className="min-h-0 min-w-0 overflow-y-auto p-3 md:p-4"
        >
          {center}
        </div>
        {footer ? (
          <div className="border-t border-[color:var(--theme-border-soft)] p-3 md:p-4">
            {footer}
          </div>
        ) : null}
      </main>

      <aside
        data-inspection-workspace-center-rail
        className="min-h-0 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel-strong)] p-3 shadow-[var(--theme-shadow-soft)]"
      >
        <div className="border-b border-[color:var(--theme-border-soft)] pb-3">
          <h2 className="text-base font-semibold text-[color:var(--theme-text-primary)]">
            Inspection Center
          </h2>
          <div className="mt-3 flex items-center justify-between text-xs text-[color:var(--theme-text-secondary)]">
            <span>Overall Progress</span>
            <span className="font-semibold">{overallPercent}%</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[color:var(--theme-surface-subtle)]">
            <div
              className="h-full rounded-full bg-sky-500 transition-[width]"
              style={{ width: `${overallPercent}%` }}
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-red-300/50 bg-red-500/10 px-2 py-2 text-center">
              <div className="text-lg font-semibold text-red-600 dark:text-red-300">{counts.fail}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-red-600 dark:text-red-300">Fail</div>
            </div>
            <div className="rounded-xl border border-amber-300/50 bg-amber-500/10 px-2 py-2 text-center">
              <div className="text-lg font-semibold text-amber-700 dark:text-amber-300">{counts.recommend}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Recommend</div>
            </div>
            <div className="rounded-xl border border-emerald-300/50 bg-emerald-500/10 px-2 py-2 text-center">
              <div className="text-lg font-semibold text-emerald-700 dark:text-emerald-300">{counts.passOrNa}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Pass / N/A</div>
            </div>
            <div className="rounded-xl border border-sky-300/50 bg-sky-500/10 px-2 py-2 text-center">
              <div className="text-lg font-semibold text-sky-700 dark:text-sky-300">{counts.workOrderLines}</div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300">WO lines</div>
            </div>
          </div>
        </div>

        <div className="space-y-2 border-b border-[color:var(--theme-border-soft)] py-3">
          <DefaultControl
            icon={<Mic className="h-4 w-4" aria-hidden />}
            label="Start Listening"
            emphasis
            onClick={clickCanonicalVoice}
          />
          <DefaultControl
            icon={<Check className="h-4 w-4" aria-hidden />}
            label="Sign inspection"
            onClick={() => focusCanonicalPanel("Technician Signature")}
          />
          <DefaultControl
            icon={<Send className="h-4 w-4" aria-hidden />}
            label="Submit findings"
            emphasis
            onClick={() => focusCanonicalPanel("Submit findings before signing")}
          />

          <div className="hidden" aria-hidden="true">
            {voiceControl}
            {reviewFindingsControl}
            {addPhotoControl}
            {signControl}
            {submitControl}
          </div>
        </div>

        <div
          data-inspection-live-findings
          className="border-b border-[color:var(--theme-border-soft)] py-3"
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
              Live Findings ({findings.length})
            </h3>
          </div>
          <div className="max-h-[30rem] space-y-2 overflow-y-auto pr-1">
            {findings.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[color:var(--theme-border-soft)] px-3 py-4 text-center text-xs text-[color:var(--theme-text-muted)]">
                Failed and recommended items appear here as they are recorded.
              </div>
            ) : (
              findings.map((finding) => (
                <button
                  key={finding.id}
                  type="button"
                  onClick={() => focusFinding(finding)}
                  className="w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3 text-left transition hover:border-sky-400/60 hover:bg-[color:var(--theme-surface-subtle)] focus:outline-none focus:ring-2 focus:ring-sky-500/50"
                  aria-label={`Go to ${finding.title}`}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={cn(
                        "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-white",
                        finding.status === "fail" ? "bg-red-600" : "bg-amber-600",
                      )}
                    >
                      {finding.status === "fail" ? "×" : "!"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="min-w-0 break-words text-sm font-semibold text-[color:var(--theme-text-primary)]">
                          {finding.title}
                        </h4>
                        <span
                          className={cn(
                            "shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                            finding.status === "fail"
                              ? "bg-red-500/10 text-red-600 dark:text-red-300"
                              : "bg-amber-500/10 text-amber-700 dark:text-amber-300",
                          )}
                        >
                          {finding.status}
                        </span>
                      </div>
                      {finding.summary ? (
                        <p className="mt-1 break-words text-xs leading-5 text-[color:var(--theme-text-secondary)]">
                          {finding.summary}
                        </p>
                      ) : null}
                      {finding.meta ? (
                        <div className="mt-2 text-[11px] text-[color:var(--theme-text-muted)]">
                          {finding.meta}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {technicianNotes ? <div className="pt-3">{technicianNotes}</div> : null}
      </aside>
    </section>
  );
}
