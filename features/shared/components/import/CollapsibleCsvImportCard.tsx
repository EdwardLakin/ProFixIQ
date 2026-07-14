"use client";

import React, { useEffect, useId, useMemo, useState } from "react";
import { OnboardingHighlightFrame } from "@/features/onboarding-v2/components/OnboardingHighlightFrame";

type GuidedHighlight = {
  active?: boolean;
  highlightKey?: string;
  title?: string;
  description?: string;
};

export type CollapsibleCsvImportCardProps = {
  title: string;
  description: React.ReactNode;
  guidedActive?: boolean;
  guided?: GuidedHighlight | null;
  forceExpanded?: boolean;
  hasSelectedFile?: boolean;
  isParsing?: boolean;
  isImporting?: boolean;
  hasValidationIssues?: boolean;
  hasImportResult?: boolean;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  testId?: string;
  eyebrow?: string;
  compactDescription?: string;
  variant?: "copper" | "workspace";
};

export function CollapsibleCsvImportCard({
  title,
  description,
  guidedActive = false,
  guided,
  forceExpanded = false,
  hasSelectedFile = false,
  isParsing = false,
  isImporting = false,
  hasValidationIssues = false,
  hasImportResult = false,
  headerActions,
  children,
  defaultExpanded = false,
  testId,
  eyebrow = "CSV import",
  compactDescription,
  variant = "workspace",
}: CollapsibleCsvImportCardProps) {
  const contentId = useId();
  const shouldAutoExpand =
    guidedActive ||
    forceExpanded ||
    hasSelectedFile ||
    isParsing ||
    isImporting ||
    hasValidationIssues ||
    hasImportResult;
  const [manuallyExpanded, setManuallyExpanded] = useState(
    defaultExpanded || shouldAutoExpand,
  );

  useEffect(() => {
    if (shouldAutoExpand) setManuallyExpanded(true);
  }, [shouldAutoExpand]);

  const expanded = shouldAutoExpand || manuallyExpanded;
  const cardClassName = useMemo(
    () =>
      variant === "workspace"
        ? "rounded-2xl border border-sky-500/20 bg-[var(--theme-gradient-panel)] p-3 shadow-[var(--theme-shadow-medium)] sm:p-4"
        : "rounded-2xl border border-[color:var(--desktop-border)] bg-[var(--theme-gradient-panel)] p-3 shadow-[var(--theme-shadow-medium)] sm:p-4",
    [variant],
  );

  const card = (
    <section data-testid={testId} className={cardClassName}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 max-w-3xl">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-200/85">
            {eyebrow}
          </div>
          <h2 className="mt-1 text-lg font-semibold text-[color:var(--theme-text-primary)] sm:text-xl">
            {title}
          </h2>
          {expanded ? (
            <div className="mt-2 space-y-2 text-sm text-[color:var(--theme-text-secondary)]">
              {description}
            </div>
          ) : (
            <p className="mt-1 text-sm text-[color:var(--theme-text-secondary)]">
              {compactDescription ?? "Upload a CSV when you need to add or update records in bulk."}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {headerActions}
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={contentId}
            onClick={() => setManuallyExpanded((current) => !current)}
            className="rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-subtle)] px-3 py-2 text-sm font-semibold text-[color:var(--theme-text-primary)] hover:bg-[color:var(--theme-surface-subtle)]"
          >
            {expanded ? "Collapse ▴" : "Expand ▾"}
          </button>
        </div>
      </div>

      {expanded ? (
        <div id={contentId} className="mt-4">
          {children}
        </div>
      ) : null}
    </section>
  );

  if (guided?.active || guidedActive) {
    return (
      <OnboardingHighlightFrame
        active
        highlightKey={guided?.highlightKey}
        title={guided?.title ?? title}
        description={guided?.description ?? "Use this card to complete the guided setup step."}
      >
        {card}
      </OnboardingHighlightFrame>
    );
  }

  return card;
}
