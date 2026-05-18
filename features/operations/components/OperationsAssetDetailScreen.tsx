"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type {
  OperationsAsset,
  OperationsAssetStatus,
  OperationsIssue,
  OperationsIssueSeverity,
  OperationsTerminology,
} from "../types";

export type OperationsAssetMetadataItem = {
  label: string;
  value?: string | null;
  mono?: boolean;
};

export type OperationsAssetAction = {
  href: string;
  label: string;
  variant?: "primary" | "secondary";
};

export type OperationsAssetStat = {
  label: string;
  value: string | number;
  helper?: string;
};

export type OperationsAssetDetailScreenProps = {
  terminology: OperationsTerminology;
  asset: OperationsAsset | null;
  issues?: OperationsIssue[];
  stats?: OperationsAssetStat[];
  metadata?: OperationsAssetMetadataItem[];
  actions?: OperationsAssetAction[];
  nextInspectionLabel?: string;
  loading?: boolean;
  error?: string | null;
  notFoundLabel?: string;
  headerLabel?: string;
  issuesTitle?: string;
  issuesDescription?: string;
  issuesEmptyLabel?: string;
  allInspectionsHref?: string;
  allInspectionsLabel?: string;
  renderIssueActions?: (issue: OperationsIssue) => ReactNode;
  statsTitle?: string;
  statsDescription?: string;
  children?: ReactNode;
};

export function OperationsAssetDetailScreen({
  terminology,
  asset,
  issues = [],
  stats = [],
  metadata = [],
  actions = [],
  nextInspectionLabel,
  loading = false,
  error = null,
  notFoundLabel,
  headerLabel,
  issuesTitle = "Open issues",
  issuesDescription,
  issuesEmptyLabel,
  allInspectionsHref,
  allInspectionsLabel = `All ${terminology.inspectionPluralLabel.toLowerCase()}`,
  renderIssueActions,
  statsTitle = "History & cost snapshot",
  statsDescription = `High-level ${terminology.assetLabel.toLowerCase()} performance and maintenance at a glance.`,
  children,
}: OperationsAssetDetailScreenProps) {
  if (loading && !asset && !issues.length) {
    return (
      <section className="rounded-3xl border border-[color:var(--metal-border-soft)] bg-black/60 px-4 py-6 text-xs text-neutral-300">
        Loading asset detail…
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-3xl border border-red-700 bg-red-900/30 px-4 py-6 text-xs text-red-200">
        {error}
      </section>
    );
  }

  if (!asset) {
    return (
      <section className="rounded-3xl border border-[color:var(--metal-border-soft)] bg-black/60 px-4 py-6 text-xs text-neutral-300">
        {notFoundLabel ?? `${terminology.assetLabel} not found.`}
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <header className="metal-card rounded-3xl p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-neutral-500">
              {headerLabel ?? terminology.assetLabel}
            </p>
            <h1
              className="mt-1 text-3xl text-neutral-100"
              style={{ fontFamily: "var(--font-blackops)" }}
            >
              {asset.label}
            </h1>

            {metadata.length > 0 && (
              <div className="mt-3 grid gap-2 text-xs text-neutral-300 sm:grid-cols-2">
                {metadata.map((item) => (
                  <div key={item.label}>
                    <span className="text-neutral-500">{item.label}:</span>{" "}
                    <span
                      className={
                        item.mono
                          ? "font-mono text-[11px] text-neutral-100"
                          : "text-neutral-100"
                      }
                    >
                      {item.value ?? "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col items-end gap-3">
            <OperationsAssetStatusBadge status={asset.status} />

            {asset.nextInspectionDate && (
              <div className="rounded-2xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2 text-right">
                <div className="text-[11px] text-neutral-400">
                  {nextInspectionLabel ?? `Next ${terminology.inspectionLabel.toLowerCase()}`}
                </div>
                <div className="text-sm font-semibold text-sky-200">
                  {new Date(asset.nextInspectionDate).toLocaleDateString()}
                </div>
              </div>
            )}

            {actions.length > 0 && (
              <div className="flex flex-wrap justify-end gap-2 text-xs">
                {actions.map((action) => (
                  <Link
                    key={`${action.href}:${action.label}`}
                    href={action.href}
                    className={
                      action.variant === "secondary"
                        ? "rounded-full border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-1.5 font-semibold text-neutral-200 hover:bg-neutral-900/50"
                        : "rounded-full bg-[color:var(--accent-copper)] px-3 py-1.5 font-semibold text-black shadow-[0_0_16px_rgba(193,102,59,0.7)] hover:opacity-95"
                    }
                  >
                    {action.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1.8fr)]">
        <section className="metal-card rounded-3xl p-4">
          <header className="mb-3 flex items-center justify-between gap-3 border-b border-[color:var(--metal-border-soft)] pb-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
                {issuesTitle}
              </p>
              {issuesDescription && (
                <p className="mt-1 text-xs text-neutral-500">
                  {issuesDescription}
                </p>
              )}
            </div>
            {allInspectionsHref && (
              <Link
                href={allInspectionsHref}
                className="rounded-full border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-200 hover:bg-neutral-900/60"
              >
                {allInspectionsLabel}
              </Link>
            )}
          </header>

          <div className="space-y-3 text-xs">
            {issues.length === 0 && (
              <p className="py-4 text-center text-xs text-neutral-500">
                {issuesEmptyLabel ??
                  `No open issues for this ${terminology.assetLabel.toLowerCase()}.`}
              </p>
            )}

            {issues.map((issue) => (
              <div
                key={issue.id}
                className="rounded-2xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <OperationsIssueSeverityChip severity={issue.severity} />
                  <span className="text-[10px] text-neutral-500">
                    {new Date(issue.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-neutral-200">
                  {issue.summary}
                </p>
                {renderIssueActions && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {renderIssueActions(issue)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="metal-card rounded-3xl p-4">
          <header className="mb-3 border-b border-[color:var(--metal-border-soft)] pb-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-400">
              {statsTitle}
            </p>
            {statsDescription && (
              <p className="mt-1 text-xs text-neutral-500">
                {statsDescription}
              </p>
            )}
          </header>

          {stats.length > 0 && (
            <div className="grid gap-3 text-xs sm:grid-cols-2">
              {stats.map((stat) => (
                <StatBlock
                  key={stat.label}
                  label={stat.label}
                  value={String(stat.value)}
                  helper={stat.helper}
                />
              ))}
            </div>
          )}

          {children}
        </section>
      </div>
    </section>
  );
}

function OperationsAssetStatusBadge({
  status,
}: {
  status: OperationsAssetStatus;
}) {
  const map: Record<
    OperationsAssetStatus,
    { label: string; className: string }
  > = {
    active: {
      label: "In service",
      className:
        "border-emerald-500/70 bg-emerald-500/15 text-emerald-200",
    },
    limited: {
      label: "Limited use",
      className:
        "border-amber-400/70 bg-amber-500/15 text-amber-200",
    },
    offline: {
      label: "Out of service",
      className: "border-red-500/80 bg-red-500/15 text-red-300",
    },
  };

  const item = map[status];

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${item.className}`}
    >
      {item.label}
    </span>
  );
}

function OperationsIssueSeverityChip({
  severity,
}: {
  severity: OperationsIssueSeverity;
}) {
  const map: Record<
    OperationsIssueSeverity,
    { label: string; className: string }
  > = {
    safety: {
      label: "Safety",
      className: "border-red-500/60 bg-red-500/10 text-red-300",
    },
    compliance: {
      label: "Compliance",
      className: "border-amber-400/60 bg-amber-500/10 text-amber-200",
    },
    recommend: {
      label: "Recommend",
      className: "border-sky-400/60 bg-sky-500/10 text-sky-200",
    },
    urgent: {
      label: "Urgent",
      className: "border-red-500/70 bg-red-500/15 text-red-200",
    },
  };

  const item = map[severity];

  return (
    <span
      className={`inline-flex rounded-full border px-2 py-[2px] text-[10px] font-semibold uppercase tracking-[0.16em] ${item.className}`}
    >
      {item.label}
    </span>
  );
}

function StatBlock({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="rounded-2xl border border-[color:var(--metal-border-soft)] bg-black/40 px-3 py-2">
      <div className="text-[11px] text-neutral-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-neutral-100">
        {value}
      </div>
      {helper && <div className="mt-1 text-[10px] text-neutral-500">{helper}</div>}
    </div>
  );
}
