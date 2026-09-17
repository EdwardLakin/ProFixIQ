"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  FileCheck2,
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
    "group flex min-h-12 w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition",
    active
      ? "border-sky-400/45 bg-sky-500/10 shadow-[inset_3px_0_0_rgba(14,165,233,0.85)]"
      : "border-transparent bg-transparent hover:border-[color:var(--theme-border-soft)] hover:bg-[color:var(--theme-surface-subtle)]",
  );
}

function DefaultControl({
  icon,
  label,
  emphasis = false,
}: {
  icon: ReactNode;
  label: string;
  emphasis?: boolean;
}) {
  return (
    <button
      type="button"
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
  const overallPercent = progressPercent(completedSections, totalSections);

  return (
    <section
      data-inspection-workspace
      className={cn(
        "grid min-h-0 gap-3 xl:grid-cols-[280px_minmax(0,1fr)_320px]",
        className,
      )}
    >
      <aside
        data-inspection-workspace-sections
        className="min-h-0 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel-strong)] p-3 shadow-[var(--theme-shadow-soft)]"
      >
        <div className="px-1 pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[color:var(--theme-text-primary)]">
                Inspection Sections
              </h2>
              <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
                {completedSections} of {totalSections} complete
              </p>
            </div>
            <span className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">
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

        <label className="mb-2 flex min-h-11 items-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 text-sm text-[color:var(--theme-text-secondary)]">
          <Search className="h-4 w-4 shrink-0" aria-hidden />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search sections..."
            className="min-w-0 flex-1 bg-transparent text-[color:var(--theme-text-primary)] outline-none placeholder:text-[color:var(--theme-text-muted)]"
            aria-label="Search inspection sections"
          />
        </label>

        <div className="max-h-[calc(100dvh-23rem)] space-y-1 overflow-y-auto pr-1 xl:max-h-[calc(100dvh-18rem)]">
          {visibleSections.map((section) => {
            const active = section.id === activeSectionId;
            const complete = section.total > 0 && section.completed >= section.total;
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
                  <span className="block truncate text-sm font-semibold text-[color:var(--theme-text-primary)]">
                    {section.title}
                  </span>
                  {section.subtitle ? (
                    <span className="mt-0.5 block truncate text-[11px] text-[color:var(--theme-text-muted)]">
                      {section.subtitle}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-xs font-semibold text-[color:var(--theme-text-secondary)]">
                  {section.completed} / {section.total}
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
        className="min-w-0 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-panel-strong)] shadow-[var(--theme-shadow-soft)]"
      >
        <div className="border-b border-[color:var(--theme-border-soft)] px-4 py-4 md:px-5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-500">
            Inspection workspace
          </div>
          <h2 className="mt-1 text-xl font-semibold text-[color:var(--theme-text-primary)]">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-1 text-xs text-[color:var(--theme-text-secondary)]">
              {subtitle}
            </p>
          ) : null}
        </div>
        <div className="min-h-0 p-3 md:p-4">{center}</div>
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
          <div className="mt-3 grid grid-cols-4 gap-2">
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
          {voiceControl ?? (
            <DefaultControl icon={<Mic className="h-4 w-4" aria-hidden />} label="Start Listening" emphasis />
          )}
          {reviewFindingsControl ?? (
            <DefaultControl icon={<FileCheck2 className="h-4 w-4" aria-hidden />} label="Review findings" />
          )}
          <div className="grid grid-cols-2 gap-2">
            {addPhotoControl ?? (
              <DefaultControl icon={<Camera className="h-4 w-4" aria-hidden />} label="Add photo" />
            )}
            {signControl ?? (
              <DefaultControl icon={<Check className="h-4 w-4" aria-hidden />} label="Sign inspection" />
            )}
          </div>
          {submitControl ?? (
            <DefaultControl icon={<Send className="h-4 w-4" aria-hidden />} label="Submit findings" emphasis />
          )}
        </div>

        <div className="border-b border-[color:var(--theme-border-soft)] py-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
              Live Findings ({findings.length})
            </h3>
          </div>
          <div className="max-h-[32rem] space-y-2 overflow-y-auto pr-1">
            {findings.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[color:var(--theme-border-soft)] px-3 py-4 text-center text-xs text-[color:var(--theme-text-muted)]">
                Failed and recommended items appear here as they are recorded.
              </div>
            ) : (
              findings.map((finding) => (
                <div
                  key={finding.id}
                  className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] p-3"
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
                        <h4 className="text-sm font-semibold text-[color:var(--theme-text-primary)]">
                          {finding.title}
                        </h4>
                        <span
                          className={cn(
                            "rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                            finding.status === "fail"
                              ? "bg-red-500/10 text-red-600 dark:text-red-300"
                              : "bg-amber-500/10 text-amber-700 dark:text-amber-300",
                          )}
                        >
                          {finding.status}
                        </span>
                      </div>
                      {finding.summary ? (
                        <p className="mt-1 text-xs leading-5 text-[color:var(--theme-text-secondary)]">
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
                </div>
              ))
            )}
          </div>
        </div>

        {technicianNotes ? <div className="pt-3">{technicianNotes}</div> : null}
      </aside>
    </section>
  );
}
